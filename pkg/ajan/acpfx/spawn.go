package acpfx

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	shellexec "github.com/eser/stack/pkg/ajan/shellfx/exec"
)

// ErrSpawn wraps every failure to bring an agent subprocess up.
var ErrSpawn = errors.New("acp agent spawn failed")

// DefaultHandshakeTimeout bounds the initialize round-trip.
//
// This is the one place in ACP where a general timeout is correct. Contrast
// Session.Prompt, which must never carry one because a turn routinely runs for
// minutes: initialize is a fast, mechanical exchange, and the common failure is
// pointing at a binary that does not speak ACP at all. Without a bound that
// case hangs forever with no diagnosis.
const DefaultHandshakeTimeout = 30 * time.Second

// shutdownGrace bounds how long Client.Close waits for a spawned agent to exit
// after stdin EOF before the connection close kills it.
const shutdownGrace = 3 * time.Second

// ShimCommand is the ACP shim this stack ships and spawns by name.
const ShimCommand = "eser-acp"

// ShimMissingHint explains how to obtain the shim.
//
// It lives here so the two packages that spawn it -- aifx and noskillsserverfx
// -- say the same thing without importing each other, and so the second half of
// the requirement is not forgotten: the shim is a *shim*. It translates ACP to
// a vendor CLI, so that CLI has to be installed too. An error naming only
// eser-acp sends someone to install one binary and hit the same wall again.
const ShimMissingHint = "install the eserstack release, which ships " +
	ShimCommand + "; note it drives a vendor CLI (claude, kiro or opencode) " +
	"that must be on PATH as well"

// SpawnOptions describes how to launch an ACP agent subprocess.
type SpawnOptions struct {
	// Command is the agent binary: "gemini", "claude-agent-acp", "codex-acp".
	Command string

	// Args are the arguments that put it in ACP mode, e.g. []string{"--acp"}.
	Args []string

	// Cwd is the working directory for the child. Note this is separate from a
	// session's cwd, which is negotiated per session/new.
	Cwd string

	// Env replaces the child's environment when non-empty.
	Env []string

	// HandshakeTimeout overrides DefaultHandshakeTimeout. Negative disables the
	// bound entirely, leaving ctx as the only limit.
	HandshakeTimeout time.Duration
}

// Spawn launches an ACP agent subprocess and completes the initialize
// handshake.
//
// The returned Client owns the child: Close shuts it down gracefully, and the
// child is also reaped if it dies on its own. On failure nothing is left
// running.
func Spawn(
	ctx context.Context,
	opts SpawnOptions,
	handler ClientHandler,
	info *Implementation,
) (*Client, error) {
	proc, err := shellexec.SpawnStreamProcess(shellexec.SpawnOptions{
		Command: opts.Command,
		Args:    opts.Args,
		Cwd:     opts.Cwd,
		Env:     opts.Env,
	})
	if err != nil {
		return nil, fmt.Errorf("%w: exec %s: %w", ErrSpawn, opts.Command, err)
	}

	handshakeCtx, stop := handshakeContext(ctx, opts.HandshakeTimeout)
	defer stop()

	client, err := newClient(
		handshakeCtx, proc.Stdout(), proc.Stdin(), proc, proc, handler, info,
	)
	if err != nil {
		return nil, spawnError(err, opts.Command, proc)
	}

	return client, nil
}

// handshakeContext bounds the initialize round-trip.
//
// G118 on both returns: the cancel func is handed to the caller, which defers
// it for the length of the handshake.
func handshakeContext(
	ctx context.Context,
	timeout time.Duration,
) (context.Context, context.CancelFunc) {
	if timeout < 0 {
		return context.WithCancel(ctx) //nolint:gosec
	}

	if timeout == 0 {
		timeout = DefaultHandshakeTimeout
	}

	return context.WithTimeout(ctx, timeout) //nolint:gosec
}

// spawnError kills the child and folds what it said into the error.
//
// A failed handshake otherwise surfaces as "connection closed: EOF", which
// says nothing about why. The child almost always explained itself on stderr
// first -- a missing API key, an unknown model, a binary that does not
// understand --acp -- and that message is the entire diagnosis.
func spawnError(cause error, command string, proc *shellexec.StreamHandle) error {
	// Close blocks until the child is reaped, so the tail and exit code are
	// final by the time they are read.
	_ = proc.Close()

	tail := strings.TrimSpace(proc.StderrTail())
	if tail == "" {
		return fmt.Errorf("%w: %s (exit %d): %w", ErrSpawn, command, proc.ExitCode(), cause)
	}

	return fmt.Errorf(
		"%w: %s (exit %d): %w: %s", ErrSpawn, command, proc.ExitCode(), cause, tail,
	)
}

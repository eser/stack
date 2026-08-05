// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package exec

import (
	"context"
	"encoding/base64"
	"errors"
	"io"
	"os/exec"
	"sync"
	"time"
)

// OutputChunk is a single chunk of output from a child process.
type OutputChunk struct {
	Stream string // "stdout" or "stderr"
	Data   []byte
}

// ChildProcessHandle manages a running child process with bidirectional I/O.
// §20 streaming: Create → Read (poll) → Close.
type ChildProcessHandle struct {
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout io.ReadCloser
	stderr io.ReadCloser
	merged chan OutputChunk
	done   chan struct{}
	cancel context.CancelFunc
	wg     sync.WaitGroup // tracks stdout+stderr reader goroutines

	// exited is closed once the child is reaped and exitCode is final. The
	// close is what orders the write in watcherLoop against every later read,
	// so exitCode needs no lock of its own.
	exited   chan struct{}
	exitCode int

	closeOnce sync.Once
}

// closeWaitDelay bounds how long cmd.Wait tolerates a child that has exited but
// left its I/O pipes held open by a surviving grandchild. Belt-and-braces
// alongside the process-group kill in Close.
const closeWaitDelay = 5 * time.Second

// SpawnOptions configures a child process.
type SpawnOptions struct {
	Command string
	Args    []string
	Cwd     string
	Env     []string
}

// newCommand builds a hardened, not-yet-started child command.
//
// Both spawn paths go through here so the process-group and WaitDelay
// hardening cannot drift apart: a future change to how children are contained
// has exactly one place to land.
func newCommand(opts SpawnOptions) (*exec.Cmd, context.CancelFunc) {
	// G118: cancel is handed to the caller, which owns it -- every spawn path
	// calls it on the error return and again in Close.
	ctx, cancel := context.WithCancel(context.Background()) //nolint:gosec

	cmd := exec.CommandContext(ctx, opts.Command, opts.Args...)

	if opts.Cwd != "" {
		cmd.Dir = opts.Cwd
	}

	if len(opts.Env) > 0 {
		cmd.Env = opts.Env
	}

	// Own process group so Close can take the whole tree down, plus a bound on
	// Wait for the case where something still holds the pipes.
	setProcessGroup(cmd)

	cmd.WaitDelay = closeWaitDelay

	return cmd, cancel
}

// SpawnChildProcess starts a child process and returns a handle.
//
// Output is merged into a single stream-tagged channel. See SpawnStreamProcess
// when the caller needs stdout as an untouched byte stream instead.
func SpawnChildProcess(opts SpawnOptions) (*ChildProcessHandle, error) {
	cmd, cancel := newCommand(opts)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		cancel()
		return nil, err
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return nil, err
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		cancel()
		return nil, err
	}

	if err := cmd.Start(); err != nil {
		cancel()
		return nil, err
	}

	h := &ChildProcessHandle{
		cmd:    cmd,
		stdin:  stdin,
		stdout: stdout,
		stderr: stderr,
		merged: make(chan OutputChunk, 64),
		done:   make(chan struct{}),
		cancel: cancel,
		exited: make(chan struct{}),
	}

	h.wg.Add(2)
	go h.readerLoop(stdout, "stdout")
	go h.readerLoop(stderr, "stderr")

	go h.watcherLoop()

	return h, nil
}

// readerLoop drains a reader and sends chunks to merged.
func (h *ChildProcessHandle) readerLoop(r io.Reader, stream string) {
	defer h.wg.Done()

	buf := make([]byte, 4096)

	for {
		n, err := r.Read(buf)
		if n > 0 {
			chunk := make([]byte, n)
			copy(chunk, buf[:n])
			select {
			case h.merged <- OutputChunk{Stream: stream, Data: chunk}:
			case <-h.done:
				return
			}
		}
		if err != nil {
			return
		}
	}
}

// watcherLoop waits for readers to finish, reaps the process, and closes merged.
//
// exited is closed before merged so that a consumer draining output sees the
// exit status already final the instant its reads stop -- the natural way to
// write such a loop is to ask for the code as soon as the channel closes.
func (h *ChildProcessHandle) watcherLoop() {
	h.wg.Wait()

	h.exitCode = waitExitCode(h.cmd)

	close(h.exited)
	close(h.merged)
}

// waitExitCode reaps a child and reduces the outcome to an exit code. A death
// by signal, or any non-ExitError failure, reports -1.
func waitExitCode(cmd *exec.Cmd) int {
	err := cmd.Wait()
	if err == nil {
		return 0
	}

	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return exitErr.ExitCode()
	}

	return -1
}

// Pid returns the process ID of the child process.
func (h *ChildProcessHandle) Pid() int {
	if h.cmd.Process == nil {
		return -1
	}
	return h.cmd.Process.Pid
}

// Exited is closed once the child has been reaped and ExitCode is final.
func (h *ChildProcessHandle) Exited() <-chan struct{} { return h.exited }

// ExitCode reports the child's exit status, or -1 while it is still running.
//
// This exists so a caller can learn how a process ended without calling Close.
// Close kills: using it merely to read the status of a process that already
// finished on its own means signalling a pid this handle no longer owns.
func (h *ChildProcessHandle) ExitCode() int {
	select {
	case <-h.exited:
		return h.exitCode
	default:
		return -1
	}
}

// Read returns the next output chunk. Returns ("", false) when the process has finished.
func (h *ChildProcessHandle) Read() (OutputChunk, bool) {
	chunk, ok := <-h.merged
	return chunk, ok
}

// Write sends data to the child process stdin. Returns false if the process is done.
func (h *ChildProcessHandle) Write(data []byte) error {
	_, err := h.stdin.Write(data)
	return err
}

// Close terminates the process and waits for cleanup. Idempotent.
//
// Close must never block indefinitely: it is reached from a synchronous FFI
// symbol (EserAjanShellExecClose), so a hang here stalls the calling JS
// runtime's main thread, not just this child.
//
// The teardown order matters. Killing the process group is what makes the
// pipes reach EOF in the common case; explicitly closing the read ends is what
// unblocks a reader goroutine already parked inside Read, which no amount of
// signalling can reach.
func (h *ChildProcessHandle) Close() int {
	h.closeOnce.Do(func() {
		h.stdin.Close() //nolint:errcheck,gosec
		close(h.done)

		// Take down the whole tree first. exec.CommandContext's own cancel only
		// signals the direct child, leaving grandchildren holding the pipes.
		killProcessGroup(h.cmd)

		// Always release the context too: it is the fallback on platforms with
		// no process groups, and it stops CommandContext leaking a watcher.
		h.cancel()

		// Force any reader parked in r.Read to return. Without this a
		// grandchild that outlived the kill keeps the write end open, wg.Wait
		// in watcherLoop never returns, and this receive blocks forever.
		h.stdout.Close() //nolint:errcheck,gosec
		h.stderr.Close() //nolint:errcheck,gosec

		<-h.exited
	})

	return h.exitCode
}

// EncodeChunk base64-encodes chunk data for wire transmission.
func EncodeChunk(data []byte) string {
	return base64.StdEncoding.EncodeToString(data)
}

// DecodeChunk base64-decodes data from wire format.
func DecodeChunk(s string) ([]byte, error) {
	return base64.StdEncoding.DecodeString(s)
}

package noskillsserverfx

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"

	"github.com/eser/stack/pkg/ajan/acpfx"
	"github.com/eser/stack/pkg/ajan/logfx"
)

// Sentinel errors for the ACP-backed worker.
var (
	ErrNoACPSession    = errors.New("acp worker: no session; query_start has not run")
	ErrACPWorkerClosed = errors.New("acp worker: closed")
	ErrPromptQueueFull = errors.New("acp worker: prompt queue full")
	ErrACPAgentMissing = errors.New("acp worker: agent binary not found")
)

// Environment overrides for the ACP agent binary.
const (
	envACPCommand = "NOSKILLS_ACP_COMMAND"
	envACPArgs    = "NOSKILLS_ACP_ARGS"
)

// defaultACPCommand is the agent binary spawned when nothing overrides it.
//
// Our own shim rather than a vendor's: it speaks ACP for every backend we
// support, so the daemon needs no per-vendor knowledge, and it is a binary we
// ship rather than a third-party Node adapter the user has to install.
const defaultACPCommand = acpfx.ShimCommand

// promptQueueDepth bounds how many turns may be waiting to run.
//
// A turn takes minutes and a human types one message at a time, so this is deep
// enough never to be reached in practice. It exists so that PushMessage -- which
// is called from the WebTransport read loop -- can never block that loop on a
// running agent.
const promptQueueDepth = 64

// acpWorker implements WorkerHandle by driving an ACP agent subprocess.
//
// It is simultaneously the ACP *client handler*: it serves session/update and
// session/request_permission, and embeds acpfx.Host to serve fs/* and
// terminal/*. Embedding is also what advertises those capabilities, since
// acpfx derives initialize's capability set from the handler's interfaces --
// so there is no second place to keep in sync.
//
// # Why it speaks the TS worker's event vocabulary
//
// Every event this emits uses the same {"type":...} envelope the Claude Agent
// SDK worker emits: sdk_event, permission_request, query_done, query_error,
// spawn_progress. That is what makes this a drop-in: the ledger, the fanout
// broadcaster, replay, forking and the WebTransport attach path all transport
// those payloads opaquely, so none of them change and no client has to be
// updated in lockstep.
//
// What changed is the *content* of sdk_event: it now carries an ACP
// SessionUpdate, which has a published schema, rather than the SDK's untyped
// message object.
type acpWorker struct {
	*acpfx.Host

	client *acpfx.Client
	logger *logfx.Logger

	sessionID string

	// dataDir and root locate the file remembering this session's agent-side id.
	// Empty dataDir disables that, which is what tests want.
	dataDir string
	root    string

	events  chan WorkerEvent
	prompts chan string

	// done closes when the worker is shutting down. It is what unblocks the
	// turn runner and every goroutine waiting on a permission decision.
	done chan struct{}

	mu sync.Mutex
	// session is nil until SendQueryStart runs. A nil session is a hard error
	// rather than an implicit create: the daemon's contract is that query_start
	// comes first, and silently inventing a session would hide a caller bug.
	session *acpfx.Session
	// pending maps a permission request id to the channel its decision arrives
	// on. The id is ours, not the agent's, because the daemon protocol and the
	// UI both correlate on it.
	pending map[string]chan string

	closeOnce sync.Once

	// eventMu guards the events channel's open/closed state together with every
	// send on it. See emit for why a select cannot do this job.
	eventMu      sync.Mutex
	eventsClosed bool
}

// spawnACPWorker launches an ACP agent and returns it as a WorkerHandle.
//
// Nothing is prompted here: the handle is returned ready for query_start,
// matching SpawnWorker's contract.
func spawnACPWorker(
	ctx context.Context,
	sessionID, cwd, dataDir string,
	logger *logfx.Logger,
) (WorkerHandle, error) {
	worker := newACPWorker(sessionID, cwd, dataDir, logger)

	worker.emit(map[string]any{"type": "spawn_progress", "stage": "starting"})

	command, args := acpAgentCommand()

	// The worker is its own client handler, so it has to exist before the
	// connection does: the agent may call back the moment initialize completes.
	client, err := acpfx.Spawn(ctx, acpfx.SpawnOptions{ //nolint:exhaustruct
		Command: command,
		Args:    args,
		Cwd:     cwd,
	}, worker, &acpfx.Implementation{
		Name:    "noskills",
		Title:   "noskills daemon",
		Version: "1",
	})
	if err != nil {
		close(worker.done)

		// A missing shim is by far the most common cause here, and the exec
		// error alone names a path without saying where it should have come
		// from. Checking after the failure rather than before keeps the happy
		// path free of an extra PATH lookup.
		if _, lookErr := exec.LookPath(command); lookErr != nil {
			return nil, fmt.Errorf(
				"%w: %q not found (%s, or set %s to its path)",
				ErrACPAgentMissing, command, acpfx.ShimMissingHint, envACPCommand,
			)
		}

		return nil, fmt.Errorf("spawn acp agent %q: %w", command, err)
	}

	worker.attach(client)

	return worker, nil
}

// newACPWorker builds the handle without connecting it to anything.
//
// Separate from spawnACPWorker so a test can attach a client speaking to an
// in-process agent over pipes: the alternative is testing this only through a
// real subprocess, which makes the interesting cases -- a permission arriving
// mid-turn, an agent that dies -- awkward to stage.
func newACPWorker(sessionID, cwd, dataDir string, logger *logfx.Logger) *acpWorker {
	return &acpWorker{ //nolint:exhaustruct
		Host:      acpfx.NewHost(acpfx.HostOptions{}), //nolint:exhaustruct
		logger:    logger,
		sessionID: sessionID,
		dataDir:   dataDir,
		root:      cwd,
		events:    make(chan WorkerEvent, 256), //nolint:mnd
		prompts:   make(chan string, promptQueueDepth),
		done:      make(chan struct{}),
		pending:   make(map[string]chan string),
	}
}

// attach binds a connected client and starts the worker's goroutines.
func (w *acpWorker) attach(client *acpfx.Client) {
	w.client = client

	w.emit(map[string]any{"type": "spawn_progress", "stage": "ready"})

	go w.runTurns()
	go w.watchConnection()
}

// acpAgentCommand resolves the agent binary and its arguments.
func acpAgentCommand() (string, []string) {
	command := os.Getenv(envACPCommand)
	if command == "" {
		command = defaultACPCommand
	}

	var args []string

	// Split on whitespace: the value is a flag list, not a shell command, so
	// there is deliberately no quoting or word-splitting step to get wrong.
	if raw := strings.TrimSpace(os.Getenv(envACPArgs)); raw != "" {
		args = strings.Fields(raw)
	}

	return command, args
}

// watchConnection ends the worker when the agent's connection dies.
//
// Without this, an agent that crashes leaves Events() open forever and the
// session never gets cleaned up: runPump only exits when the channel closes.
func (w *acpWorker) watchConnection() {
	select {
	case <-w.client.Done():
		w.emit(map[string]any{
			"type":     "query_error",
			"error":    "acp agent connection closed",
			"exitCode": nil,
			"stderr":   nil,
		})
		w.closeEvents()

	case <-w.done:
	}
}

// ── WorkerHandle ─────────────────────────────────────────────────────────────

// SendQueryStart opens the ACP session.
//
// resume is honoured through session/load when the agent advertises it. The
// old SDK path could not use resume at all -- wt_attach passes "" and
// continuity comes from replaying the ledger -- so an agent that supports it
// now gets the chance to restore its own state instead.
func (w *acpWorker) SendQueryStart(ctx context.Context, cwd, sessionID, resume string) error {
	session, err := w.openSession(ctx, cwd, resume)
	if err != nil {
		w.emit(map[string]any{
			"type":     "query_error",
			"error":    err.Error(),
			"exitCode": nil,
			"stderr":   nil,
		})

		return err
	}

	w.mu.Lock()
	w.session = session
	w.mu.Unlock()

	w.rememberAgentSession(session.ID())

	w.logger.Info(
		"acp session opened", "session", sessionID, "agent", session.ID(), "resumed", resume != "",
	)

	return nil
}

// PushMessage queues a user turn.
//
// It returns as soon as the turn is queued rather than when it completes. That
// is required, not merely convenient: this is called from the WebTransport read
// loop, and an agent turn runs for minutes, so blocking here would stop the
// client from being able to send the cancel that ends it.
func (w *acpWorker) PushMessage(content string) error {
	select {
	case <-w.done:
		return ErrACPWorkerClosed
	default:
	}

	select {
	case w.prompts <- content:
		return nil
	case <-w.done:
		return ErrACPWorkerClosed
	default:
		return ErrPromptQueueFull
	}
}

// runTurns is the single consumer of the prompt queue.
//
// One turn at a time: ACP has no notion of concurrent prompts within a session,
// and the transcript order a client renders is the order turns ran in.
func (w *acpWorker) runTurns() {
	for {
		select {
		case content := <-w.prompts:
			w.runOneTurn(content)
		case <-w.done:
			return
		}
	}
}

// runOneTurn executes a single prompt and reports how it ended.
func (w *acpWorker) runOneTurn(content string) {
	session := w.currentSession()
	if session == nil {
		w.emit(map[string]any{
			"type":     "query_error",
			"error":    ErrNoACPSession.Error(),
			"exitCode": nil,
			"stderr":   nil,
		})

		return
	}

	// Bound by the worker's lifetime, not by a timeout: a turn legitimately runs
	// for many minutes, and the caller's cancel arrives as StopTask rather than
	// as a dead context.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		select {
		case <-w.done:
			cancel()
		case <-ctx.Done():
		}
	}()

	resp, err := session.Prompt(ctx, []acpfx.ContentBlock{acpfx.TextBlock(content)})
	if err != nil {
		w.emit(map[string]any{
			"type":     "query_error",
			"error":    err.Error(),
			"exitCode": nil,
			"stderr":   nil,
		})

		return
	}

	// query_done carries the stop reason, which the SDK path had no way to
	// report. It is additive: a consumer that only checks the type is unaffected.
	//
	// Note this fires per turn, where the SDK worker fired it once when the whole
	// query ended. Per turn is the more useful signal -- it means "the agent is
	// idle again", which is what a UI showing a spinner actually needs.
	w.emit(map[string]any{"type": "query_done", "stopReason": string(resp.StopReason)})
}

func (w *acpWorker) currentSession() *acpfx.Session {
	w.mu.Lock()
	defer w.mu.Unlock()

	return w.session
}

// PermissionResponse resolves a pending session/request_permission.
func (w *acpWorker) PermissionResponse(requestID, behavior, message string) error {
	_ = message // ACP carries no free-text rejection message on the outcome.

	w.mu.Lock()
	reply, ok := w.pending[requestID]

	if ok {
		delete(w.pending, requestID)
	}

	w.mu.Unlock()

	if !ok {
		// Not an error worth failing on: a decision can legitimately arrive after
		// the request was abandoned by a cancel.
		return nil
	}

	reply <- behavior

	return nil
}

// SendMux has no ACP analogue and is a no-op.
//
// Mux frames drive a terminal multiplexer, not an agent; sessions that need
// them run the mux worker, which is a different WorkerHandle entirely. Returning
// nil rather than an error keeps the daemon's dispatch table uniform.
func (w *acpWorker) SendMux(_ json.RawMessage) error { return nil }

// SetMode switches the ACP session's mode.
//
// This is what makes the client's set_permission_mode command mean something:
// it was a declared command the daemon silently dropped, because the SDK worker
// had nowhere to send it.
func (w *acpWorker) SetMode(mode string) error {
	session := w.currentSession()
	if session == nil {
		return ErrNoACPSession
	}

	if err := session.SetMode(context.Background(), mode); err != nil {
		return fmt.Errorf("acp session/set_mode: %w", err)
	}

	return nil
}

// StopTask cancels the in-flight turn.
func (w *acpWorker) StopTask() error {
	session := w.currentSession()
	if session == nil {
		return nil
	}

	if err := session.Cancel(context.Background()); err != nil {
		return fmt.Errorf("acp session/cancel: %w", err)
	}

	return nil
}

// Close tears down the agent.
func (w *acpWorker) Close() error {
	var err error

	w.closeOnce.Do(func() {
		close(w.done)

		if session := w.currentSession(); session != nil {
			session.Close()
		}

		// Terminals outlive a session in ACP -- nothing in v1 ends one -- so a
		// client that never releases them leaks a process each. This is the point
		// where the connection is going away, so it is the last chance.
		// (This is Host.ReleaseAll, reached through the embedded field.)
		w.ReleaseAll()

		if w.client != nil {
			err = w.client.Close()
		}

		w.closeEvents()
	})

	if err != nil {
		return fmt.Errorf("acp worker close: %w", err)
	}

	return nil
}

func (w *acpWorker) Events() <-chan WorkerEvent { return w.events }

func (w *acpWorker) SessionID() string { return w.sessionID }

// ── acpfx.ClientHandler ──────────────────────────────────────────────────────

// SessionUpdate forwards one streamed change as an sdk_event.
func (w *acpWorker) SessionUpdate(_ context.Context, note *acpfx.SessionNotification) {
	w.emit(map[string]any{"type": "sdk_event", "event": note.Update})
}

// Compile-time interface assertions. The handler ones are load-bearing: acpfx
// derives what initialize advertises from exactly these, so losing one would
// silently un-advertise a capability that is still being served.
var (
	_ WorkerHandle          = (*acpWorker)(nil)
	_ acpfx.ClientHandler   = (*acpWorker)(nil)
	_ acpfx.FsHandler       = (*acpWorker)(nil)
	_ acpfx.TerminalHandler = (*acpWorker)(nil)
	_ acpfx.SessionObserver = (*acpWorker)(nil)
)

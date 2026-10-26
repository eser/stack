// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsserverfx

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/eser/stack/pkg/ajan/muxfx"
)

// ── Mux worker ────────────────────────────────────────────────────────────────

// The mux worker hosts one muxfx server in the daemon's own process. A pane's
// content is VT bytes rather than protocol messages, which is why mux sessions
// used to run a TypeScript worker over a Unix socket; the Go engine makes that
// process unnecessary. Its events are the two spawn_progress messages that
// worker sent around the start. The frames the mux server sends do not go
// through the events: the server is connected to a muxHub, and every
// WebTransport attach of the session joins it with a socket of its own
// (wt_attach.go), so the server's screen pacing sees how far behind each
// client is.

const (
	// muxInitialCols and muxInitialRows seed the viewport. The browser
	// frontend reports its own size when it attaches.
	muxInitialCols = 120
	muxInitialRows = 40

	// muxFirstTabCommand runs in the tab query_start opens, so a client that
	// attaches to a new session sees a live pane.
	muxFirstTabCommand = "claude"
	muxFirstTabTitle   = "free"

	// muxEventBuffer is how many events may wait for the session pump.
	muxEventBuffer = 256

	// muxDisposeTimeout bounds Close. Disposing the server sends SIGTERM to
	// every pane, waits 2 s, then sends SIGKILL and waits 2 s more.
	muxDisposeTimeout = 10 * time.Second

	// muxDefaultShell runs in a pane that names no command when SHELL is
	// unset.
	muxDefaultShell = "/bin/sh"
)

// Environment variables the spawn resolver sets in every pane.
const (
	envPaneSession     = "NOSKILLS_SESSION"
	envPaneProjectRoot = "NOSKILLS_PROJECT_ROOT"
)

// ErrMuxWorkerClosed is returned by a send to a mux worker that is closed.
var ErrMuxWorkerClosed = errors.New("mux worker: closed")

// ErrMuxFrameNotObject is returned by SendMux for a frame that is not a JSON
// object.
var ErrMuxFrameNotObject = errors.New("mux frame is not a JSON object")

// muxWorker implements WorkerHandle for kind=mux sessions.
type muxWorker struct {
	sessionID string
	server    *muxfx.Server
	// hub is the server's frontend; the attached clients join it.
	hub *muxHub

	// events carries the worker's events for the session pump. It is closed by
	// shutdown alone, after every push has returned.
	events chan WorkerEvent
	// done is closed when shutdown starts, which releases a push that waits
	// on a full events channel.
	done chan struct{}
	// pushes counts the pushes under way, so shutdown closes events only
	// once none can send on it.
	pushes sync.WaitGroup

	// mu guards the fields below.
	mu sync.Mutex
	// cwd and querySession are learned at query_start, which arrives after
	// the server is built, so the spawn resolver reads them per spawn.
	cwd          string
	querySession string
	closed       bool

	closeOnce  sync.Once
	disposeErr error
}

// muxWorkerOptions replaces parts of a mux worker's server, for tests: the
// pane backend (nil means pseudo-terminals) and the clock that paces screen
// messages (nil means the time package).
type muxWorkerOptions struct {
	newHost func(cb muxfx.PtyHostCallbacks) muxfx.PtyHost
	clock   muxfx.Clock
}

// spawnMuxWorker builds a mux worker whose panes start in cwd. ctx bounds the
// call only: the worker belongs to the session, not to the request that
// spawned it, and ends through Close. Its log entries carry ctx's values.
func spawnMuxWorker(ctx context.Context, sessionID, cwd string, logger *logfx.Logger) (WorkerHandle, error) {
	worker, err := startMuxWorker(ctx, sessionID, cwd, logger, muxWorkerOptions{}) //nolint:exhaustruct // the defaults
	if err != nil {
		return nil, err
	}

	return worker, nil
}

// startMuxWorker is spawnMuxWorker with opts.
func startMuxWorker(
	ctx context.Context,
	sessionID, cwd string,
	logger *logfx.Logger,
	opts muxWorkerOptions,
) (*muxWorker, error) {
	if err := ctx.Err(); err != nil {
		return nil, fmt.Errorf("start mux session %s: %w", sessionID, err)
	}

	logCtx := context.WithoutCancel(ctx)

	worker := &muxWorker{ //nolint:exhaustruct
		sessionID: sessionID,
		events:    make(chan WorkerEvent, muxEventBuffer),
		done:      make(chan struct{}),
		cwd:       cwd,
		hub:       newMuxHub(),
	}

	worker.push(WorkerEvent{Type: "spawn_progress", Payload: []byte(`{"type":"spawn_progress","stage":"starting"}`)})

	worker.server = muxfx.NewServer(&muxfx.ServerOptions{ //nolint:exhaustruct
		InitialState: muxfx.NewInitialState(muxfx.Viewport{Cols: muxInitialCols, Rows: muxInitialRows}),
		ResolveSpawn: worker.resolveSpawn,
		// A remote session outlives any single tab; closing the last one
		// leaves an empty multiplexer the client can repopulate.
		KeepEmptySession: true,
		NewHost:          opts.newHost,
		Clock:            opts.clock,
		OnError: func(err error) {
			logger.WarnContext(logCtx, "mux session: pane input or resize failed", "sid", sessionID, "err", err)
		},
	})

	// Every frame a client sends crosses the network, and the hub's
	// transport passes each through the remote sanitizer. Without it a client
	// could send newTab or newPane naming any command, arguments and working
	// directory, and the daemon would run it with its own environment, or
	// report a viewport that makes every pane allocate millions of cells.
	worker.server.Connect(worker.hub.transport)

	worker.push(WorkerEvent{Type: "spawn_progress", Payload: []byte(`{"type":"spawn_progress","stage":"ready"}`)})

	return worker, nil
}

// resolveSpawn decides what a pane runs: agentSpawnSpec with the session's
// directory and id, which query_start may have changed.
func (w *muxWorker) resolveSpawn(pane *muxfx.Pane, _ muxfx.Geom) muxfx.SpawnSpec {
	w.mu.Lock()
	root := w.cwd
	querySession := w.querySession
	w.mu.Unlock()

	return agentSpawnSpec(pane, root, querySession)
}

// agentSpawnSpec is the Go form of the TypeScript buildAgentSpawnResolver,
// shared by mux sessions and the dashboard: the pane's own command or the
// user's shell, the pane's directory or root, and the daemon's environment
// with the session id (the pane's, else fallbackSession) and the project root
// added.
func agentSpawnSpec(pane *muxfx.Pane, root, fallbackSession string) muxfx.SpawnSpec {
	command := pane.Command
	if command == "" {
		command = os.Getenv("SHELL")
	}

	if command == "" {
		command = muxDefaultShell
	}

	cwd := pane.Cwd
	if cwd == "" {
		cwd = root
	}

	sessionID, ok := pane.Meta["sessionId"]
	if !ok {
		sessionID = fallbackSession
	}

	// Read per spawn, so a long-lived session sees a changed environment.
	env := withoutEnvKeys(os.Environ(), envPaneSession, envPaneProjectRoot)
	env = append(env, envPaneSession+"="+sessionID, envPaneProjectRoot+"="+root)

	return muxfx.SpawnSpec{
		Command: command,
		Args:    pane.Args,
		Cwd:     cwd,
		Env:     env,
	}
}

// withoutEnvKeys returns env without the KEY=VALUE entries of keys.
func withoutEnvKeys(env []string, keys ...string) []string {
	kept := make([]string, 0, len(env)+len(keys))

	for _, entry := range env {
		name, _, _ := strings.Cut(entry, "=")

		drop := false

		for _, key := range keys {
			if name == key {
				drop = true

				break
			}
		}

		if !drop {
			kept = append(kept, entry)
		}
	}

	return kept
}

// push hands evt to the pump. It waits while the events channel is full, and
// returns at once when the worker is closed or closing.
func (w *muxWorker) push(evt WorkerEvent) {
	w.mu.Lock()
	if w.closed {
		w.mu.Unlock()

		return
	}

	w.pushes.Add(1)
	w.mu.Unlock()

	defer w.pushes.Done()

	select {
	case w.events <- evt:
	case <-w.done:
	}
}

// begin reports whether a send to the worker may start: ctx has not ended
// and the worker is open.
func (w *muxWorker) begin(ctx context.Context, what string) error {
	if err := ctx.Err(); err != nil {
		return fmt.Errorf("%s for mux session %s: %w", what, w.sessionID, err)
	}

	w.mu.Lock()
	closed := w.closed
	w.mu.Unlock()

	if closed {
		return fmt.Errorf("%s for mux session %s: %w", what, w.sessionID, ErrMuxWorkerClosed)
	}

	return nil
}

// SendQueryStart records the session's directory and id (an empty value keeps
// the one it had) and opens the first tab, running claude.
func (w *muxWorker) SendQueryStart(ctx context.Context, cwd, sessionID, _ string) error {
	if err := w.begin(ctx, "start"); err != nil {
		return err
	}

	w.mu.Lock()
	if cwd != "" {
		w.cwd = cwd
	}

	if sessionID != "" {
		w.querySession = sessionID
	}

	tabCwd := w.cwd
	tabSession := w.querySession
	w.mu.Unlock()

	// Dispatched from the daemon itself, so it is not sanitized: this is the
	// one place a command is named.
	w.server.Dispatch(&muxfx.Action{ //nolint:exhaustruct
		Type:    muxfx.ActionNewTab,
		Command: muxFirstTabCommand,
		Cwd:     tabCwd,
		Title:   muxFirstTabTitle,
		Meta:    map[string]string{"sessionId": tabSession},
	})

	return nil
}

// PushMessage does nothing: a mux session takes input through mux frames.
func (w *muxWorker) PushMessage(context.Context, string) error { return nil }

// PermissionResponse does nothing: a mux session asks for no permissions.
func (w *muxWorker) PermissionResponse(context.Context, string, string, string) error { return nil }

// SetMode does nothing: a mux session has no mode concept.
func (w *muxWorker) SetMode(context.Context, string) error { return nil }

// SendMux passes a frontend frame (a {"t":...} object) to the mux server,
// through the sanitizer. The server ignores frames whose t it does not know.
func (w *muxWorker) SendMux(ctx context.Context, frame json.RawMessage) error {
	if err := w.begin(ctx, "send a mux frame"); err != nil {
		return err
	}

	trimmed := bytes.TrimSpace(frame)
	if len(trimmed) == 0 || trimmed[0] != '{' {
		return fmt.Errorf("send a mux frame for mux session %s: %w", w.sessionID, ErrMuxFrameNotObject)
	}

	var msg muxfx.FrontendToServer
	if err := json.Unmarshal(trimmed, &msg); err != nil {
		return fmt.Errorf("send a mux frame for mux session %s: read the frame: %w", w.sessionID, err)
	}

	w.hub.deliver(&msg)

	return nil
}

// joinRemote attaches a client's socket to the mux server's frames. The
// client gets them once its attach frame has made the server send a full
// scene.
func (w *muxWorker) joinRemote(socket muxSocket) {
	w.hub.join(socket)
}

// leaveRemote stops the frames to a client's socket.
func (w *muxWorker) leaveRemote(socket muxSocket) {
	w.hub.detach(socket)
}

// StopTask ends the session, as the TypeScript worker did on stop_task and
// abort: every pane is stopped and the event stream closes. ctx bounds the
// wait for the panes.
func (w *muxWorker) StopTask(ctx context.Context) error {
	disposeCtx, cancel := context.WithTimeout(ctx, muxDisposeTimeout)
	defer cancel()

	return w.shutdown(disposeCtx)
}

// Close stops every pane and closes the event stream. It is safe to call more
// than once and from any goroutine, and returns within muxDisposeTimeout.
func (w *muxWorker) Close() error {
	disposeCtx, cancel := context.WithTimeout(context.Background(), muxDisposeTimeout)
	defer cancel()

	return w.shutdown(disposeCtx)
}

// shutdown runs once: it refuses new pushes, releases the waiting ones,
// disposes the server and then closes the event stream. Later calls wait for
// the first and return its result.
func (w *muxWorker) shutdown(ctx context.Context) error {
	w.closeOnce.Do(func() {
		w.mu.Lock()
		w.closed = true
		close(w.done)
		w.mu.Unlock()

		if err := w.server.Dispose(ctx); err != nil {
			w.disposeErr = fmt.Errorf("close mux session %s: %w", w.sessionID, err)
		}

		w.pushes.Wait()
		close(w.events)
	})

	return w.disposeErr
}

func (w *muxWorker) Events() <-chan WorkerEvent { return w.events }

func (w *muxWorker) SessionID() string { return w.sessionID }

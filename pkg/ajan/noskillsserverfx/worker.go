package noskillsserverfx

import (
	"context"
	"encoding/json"

	"github.com/eser/stack/pkg/ajan/logfx"
)

// ── Wire types ────────────────────────────────────────────────────────────────

// WorkerEvent is emitted on the Events() channel for each message from the worker.
type WorkerEvent struct {
	Type    string
	Payload []byte // raw JSON of the entire message

	// Line is the number of the session's ledger line this event was written
	// as, set by SessionEntry.publish; 0 for an event that is not in the
	// ledger. An attach turns it into the seq a client gets.
	Line int64
}

// Worker flavours accepted by SpawnWorker and by the ?kind= attach parameter.
const (
	// WorkerKindAgent is an agent session. It is also the zero value: an unset
	// kind means this one.
	//
	// It is served by the ACP worker. "agent" and "acp" name the same thing;
	// both are accepted because clients and stored sessions carry either
	// string.
	WorkerKindAgent = "agent"

	// WorkerKindMux is the terminal-multiplexer worker.
	WorkerKindMux = "mux"

	// WorkerKindACP is an explicit spelling of WorkerKindAgent.
	WorkerKindACP = "acp"
)

// ── Interface ─────────────────────────────────────────────────────────────────

// WorkerHandle is the daemon-side handle to the worker of one session: the
// in-process mux worker or the ACP worker.
//
// Every method that sends to the worker takes the caller's ctx, and nothing
// is sent once ctx has ended.
type WorkerHandle interface {
	// SendQueryStart sends the initial query_start message to the worker.
	SendQueryStart(ctx context.Context, cwd, sessionID string, resume string) error
	// PushMessage pushes a user message into the running query.
	PushMessage(ctx context.Context, content string) error
	// PermissionResponse resolves a pending canUseTool request.
	PermissionResponse(ctx context.Context, requestID, behavior, message string) error
	// SendMux relays a raw mux frontend frame (a {"t":...} object) to a mux
	// worker. No-op semantics for agent workers (they ignore unknown messages).
	SendMux(ctx context.Context, frame json.RawMessage) error
	// SetMode switches the session's mode, e.g. plan vs edit. Workers that have
	// no mode concept return nil rather than an error: the client's request was
	// well-formed and there is nothing to fail. ctx bounds the call.
	SetMode(ctx context.Context, mode string) error
	// StopTask asks the worker to abort the current task gracefully. ctx
	// bounds the call.
	StopTask(ctx context.Context) error
	// Close tears down the worker and whatever it started.
	Close() error
	// Events returns a channel of worker-to-daemon messages.
	Events() <-chan WorkerEvent
	// SessionID returns the session this handle is bound to.
	SessionID() string
}

// Compile-time interface assertions.
//
// Without these an implementation that falls behind the interface fails only
// where it is assigned -- one line in sessions.go for the real worker, and a
// test file for the mock. Naming them here makes an interface change point at
// every implementation that has to follow it.
var (
	_ WorkerHandle = (*muxWorker)(nil)
	_ WorkerHandle = (*acpWorker)(nil)
	_ WorkerHandle = (*MockWorkerHandle)(nil)
)

// ── Spawning ──────────────────────────────────────────────────────────────────

// SpawnWorker starts the worker of one session and returns its handle once
// the worker is ready to accept query_start.
//
// kind selects the worker flavour: "mux" hosts a terminal multiplexer
// (muxfx) in this process; anything else -- "", "agent", "acp" -- drives an
// Agent Client Protocol agent directly from Go. Neither starts a JavaScript
// runtime.
func SpawnWorker(
	ctx context.Context,
	sessionID, cwd, dataDir, kind string,
	logger *logfx.Logger,
) (WorkerHandle, error) {
	if kind == WorkerKindMux {
		return spawnMuxWorker(ctx, sessionID, cwd, logger)
	}

	return spawnACPWorker(ctx, sessionID, cwd, dataDir, logger)
}

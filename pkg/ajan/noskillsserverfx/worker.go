package noskillsserverfx

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/eser/stack/pkg/ajan/logfx"
)

// ── Wire types ────────────────────────────────────────────────────────────────

// WorkerEvent is emitted on the Events() channel for each message from the worker.
type WorkerEvent struct {
	Type    string
	Payload []byte // raw JSON of the entire message
}

// Worker flavours accepted by SpawnWorker and by the ?kind= attach parameter.
const (
	// WorkerKindAgent is the Claude Agent SDK worker. It is also the zero value:
	// an unset kind means this one.
	WorkerKindAgent = "agent"

	// WorkerKindMux is the terminal-multiplexer worker.
	WorkerKindMux = "mux"

	// WorkerKindACP drives an ACP agent from Go, with no TS worker in between.
	WorkerKindACP = "acp"
)

// ── Interface ─────────────────────────────────────────────────────────────────

// WorkerHandle is the daemon-side handle to a running TS worker process.
type WorkerHandle interface {
	// SendQueryStart sends the initial query_start message to the worker.
	SendQueryStart(ctx context.Context, cwd, sessionID string, resume string) error
	// PushMessage pushes a user message into the running query.
	PushMessage(content string) error
	// PermissionResponse resolves a pending canUseTool request.
	PermissionResponse(requestID, behavior, message string) error
	// SendMux relays a raw mux frontend frame (a {"t":...} object) to a mux
	// worker. No-op semantics for agent workers (they ignore unknown messages).
	SendMux(frame json.RawMessage) error
	// SetMode switches the session's mode, e.g. plan vs edit. Workers that have
	// no mode concept return nil rather than an error: the client's request was
	// well-formed and there is nothing to fail.
	SetMode(mode string) error
	// StopTask asks the worker to abort the current task gracefully.
	StopTask() error
	// Close tears down the worker process.
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
	_ WorkerHandle = (*workerImpl)(nil)
	_ WorkerHandle = (*acpWorker)(nil)
	_ WorkerHandle = (*MockWorkerHandle)(nil)
)

// ── Implementation ────────────────────────────────────────────────────────────

type workerImpl struct {
	sessionID string
	cmd       *exec.Cmd
	conn      net.Conn
	events    chan WorkerEvent
	enc       *json.Encoder
	mu        sync.Mutex
	once      sync.Once
}

// SpawnWorker creates a Unix socket listener, spawns the worker process, waits
// for "ready", and returns a WorkerHandle. Returns when the worker is ready to
// accept query_start.
//
// kind selects the worker flavour: "" / "agent" runs the Claude Agent SDK
// worker (worker.js under node/tsx); "mux" runs the terminal-multiplexer worker
// (mux-worker.ts under Deno, which resolves @eserstack/mux's workspace imports);
// "acp" drives an Agent Client Protocol agent directly from Go, with no TS
// worker process in between.
func SpawnWorker(
	ctx context.Context,
	sessionID, cwd, dataDir, workerPath, kind string,
	logger *logfx.Logger,
) (WorkerHandle, error) {
	// The ACP path shares none of the socket handshake below: the protocol is
	// the transport, so there is no listener, no ready message and no worker
	// script to resolve.
	if kind == WorkerKindACP {
		return spawnACPWorker(ctx, sessionID, cwd, dataDir, logger)
	}

	isMux := kind == WorkerKindMux

	if workerPath == "" {
		switch {
		case isMux && os.Getenv("NOSKILLS_MUX_WORKER_PATH") != "":
			workerPath = os.Getenv("NOSKILLS_MUX_WORKER_PATH")
		case isMux:
			exe, _ := os.Executable()
			workerPath = filepath.Join(filepath.Dir(exe), "mux-worker.ts")
		case os.Getenv("NOSKILLS_WORKER_PATH") != "":
			workerPath = os.Getenv("NOSKILLS_WORKER_PATH")
		default:
			exe, _ := os.Executable()
			workerPath = filepath.Join(filepath.Dir(exe), "worker.js")
		}
	}

	runtimeDir := filepath.Join(dataDir, "runtime")
	if err := os.MkdirAll(runtimeDir, 0o700); err != nil {
		return nil, fmt.Errorf("mkdir runtime: %w", err)
	}

	sockPath := filepath.Join(runtimeDir, sessionID+".sock")
	_ = os.Remove(sockPath) //nolint:gosec // sockPath is dataDir/runtime/{sid}.sock, not user input

	listener, err := net.Listen("unix", sockPath)
	if err != nil {
		return nil, fmt.Errorf("listen unix socket: %w", err)
	}

	defer func() {
		// Listener is only used to accept the single initial connection.
		_ = listener.Close()
	}()

	// Determine runner command. The mux worker imports @eserstack/mux (workspace
	// + .ts specifiers) so it must run under Deno; the agent worker is tsc-built
	// (.js → node) or .ts → tsx.
	var runCmd string

	var runArgs []string

	switch {
	case isMux:
		runCmd = "deno"
		runArgs = append(runArgs, "run", "-A")
	case strings.HasSuffix(workerPath, ".ts"):
		if _, err := exec.LookPath("tsx"); err == nil {
			runCmd = "tsx"
		} else {
			runCmd = "node"
			runArgs = append(runArgs, "--loader", "tsx")
		}
	default:
		runCmd = "node"
	}

	runArgs = append(runArgs, workerPath, sockPath)

	cmd := exec.CommandContext(ctx, runCmd, runArgs...) //nolint:gosec
	cmd.Dir = cwd
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("spawn worker: %w", err)
	}

	// Accept the worker's connection (with timeout).
	deadline := time.Now().Add(30 * time.Second)
	if err := listener.(*net.UnixListener).SetDeadline(deadline); err != nil { //nolint:forcetypeassert
		_ = cmd.Process.Kill()

		return nil, fmt.Errorf("set accept deadline: %w", err)
	}

	conn, err := listener.Accept()
	if err != nil {
		_ = cmd.Process.Kill()

		return nil, fmt.Errorf("accept worker connection: %w", err)
	}

	w := &workerImpl{
		sessionID: sessionID,
		cmd:       cmd,
		conn:      conn,
		events:    make(chan WorkerEvent, 256),
		enc:       json.NewEncoder(conn),
	}

	// Wait for "ready" message.
	if err := w.waitForReady(ctx); err != nil {
		_ = cmd.Process.Kill()
		_ = conn.Close()

		return nil, fmt.Errorf("worker did not send ready: %w", err)
	}

	// Start background reader.
	go w.readLoop(logger)
	go func() {
		_ = cmd.Wait()
		w.once.Do(func() { close(w.events) })
	}()

	return w, nil
}

func (w *workerImpl) waitForReady(ctx context.Context) error {
	deadline, ok := ctx.Deadline()
	if !ok {
		deadline = time.Now().Add(30 * time.Second)
	}

	if err := w.conn.SetReadDeadline(deadline); err != nil {
		return err
	}

	defer func() { _ = w.conn.SetReadDeadline(time.Time{}) }()

	scanner := bufio.NewScanner(w.conn)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var msg struct {
			Type  string `json:"type"`
			Stage string `json:"stage,omitempty"`
		}

		if err := json.Unmarshal([]byte(line), &msg); err != nil {
			continue
		}

		// Forward spawn_progress before ready.
		if msg.Type == "spawn_progress" {
			w.events <- WorkerEvent{Type: "spawn_progress", Payload: []byte(line)}

			continue
		}

		if msg.Type == "ready" {
			return nil
		}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("scanner: %w", err)
	}

	return fmt.Errorf("connection closed before ready") //nolint:err113
}

func (w *workerImpl) readLoop(logger *logfx.Logger) {
	scanner := bufio.NewScanner(w.conn)
	scanner.Buffer(make([]byte, 1<<20), 1<<20) // 1 MB line buffer

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var msg struct {
			Type string `json:"type"`
		}

		if err := json.Unmarshal([]byte(line), &msg); err != nil {
			logger.Warn("worker: malformed message", "line", line[:min(len(line), 200)])

			continue
		}

		w.events <- WorkerEvent{Type: msg.Type, Payload: []byte(line)}
	}

	w.once.Do(func() { close(w.events) })
}

// sendLocked encodes msg onto the worker's stdin. The caller must already hold
// w.mu -- w.mu is a plain sync.Mutex and is not reentrant, so any path that
// already holds it must use this rather than send.
func (w *workerImpl) sendLocked(msg any) error {
	return w.enc.Encode(msg) //nolint:wrapcheck
}

func (w *workerImpl) send(msg any) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	return w.sendLocked(msg)
}

func (w *workerImpl) SendQueryStart(ctx context.Context, cwd, sessionID, resume string) error {
	type queryStart struct {
		Type      string `json:"type"`
		Cwd       string `json:"cwd"`
		SessionID string `json:"sessionId"`
		Resume    string `json:"resume,omitempty"`
	}

	_ = ctx

	return w.send(queryStart{
		Type:      "query_start",
		Cwd:       cwd,
		SessionID: sessionID,
		Resume:    resume,
	})
}

func (w *workerImpl) PushMessage(content string) error {
	return w.send(map[string]string{"type": "push_message", "content": content})
}

func (w *workerImpl) PermissionResponse(requestID, behavior, message string) error {
	type resp struct {
		Type      string `json:"type"`
		RequestID string `json:"requestId"`
		Behavior  string `json:"behavior"`
		Message   string `json:"message,omitempty"`
	}

	return w.send(resp{
		Type:      "permission_response",
		RequestID: requestID,
		Behavior:  behavior,
		Message:   message,
	})
}

func (w *workerImpl) SendMux(frame json.RawMessage) error {
	// {"type":"mux","frame":<frontend frame>} — the mux worker delivers `frame`
	// straight to its mux server.
	return w.send(struct {
		Type  string          `json:"type"`
		Frame json.RawMessage `json:"frame"`
	}{Type: "mux", Frame: frame})
}

// SetMode forwards the request to the worker.
//
// The Claude Agent SDK worker has no mode concept and ignores unknown messages,
// so today this reaches nothing. It is still sent rather than dropped here: the
// daemon should not be the component that decides a worker cannot do something,
// and a worker that grows the capability needs no change on this side.
func (w *workerImpl) SetMode(mode string) error {
	return w.send(map[string]string{"type": "set_mode", "mode": mode})
}

func (w *workerImpl) StopTask() error {
	return w.send(map[string]string{"type": "stop_task"})
}

func (w *workerImpl) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()

	// sendLocked, not send: we already hold w.mu and it is not reentrant.
	_ = w.sendLocked(map[string]string{"type": "shutdown"})
	_ = w.conn.Close()

	if w.cmd.Process != nil {
		return w.cmd.Process.Kill() //nolint:wrapcheck
	}

	return nil
}

func (w *workerImpl) Events() <-chan WorkerEvent {
	return w.events
}

func (w *workerImpl) SessionID() string {
	return w.sessionID
}

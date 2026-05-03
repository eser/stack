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

// ── Interface ─────────────────────────────────────────────────────────────────

// WorkerHandle is the daemon-side handle to a running TS worker process.
type WorkerHandle interface {
	// SendQueryStart sends the initial query_start message to the worker.
	SendQueryStart(ctx context.Context, cwd, sessionID string, resume string) error
	// PushMessage pushes a user message into the running query.
	PushMessage(content string) error
	// PermissionResponse resolves a pending canUseTool request.
	PermissionResponse(requestID, behavior, message string) error
	// StopTask asks the worker to abort the current task gracefully.
	StopTask() error
	// Close tears down the worker process.
	Close() error
	// Events returns a channel of worker-to-daemon messages.
	Events() <-chan WorkerEvent
	// SessionID returns the session this handle is bound to.
	SessionID() string
}

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

// SpawnWorker creates a Unix socket listener, spawns the TS worker process,
// waits for "ready", and returns a WorkerHandle. Returns when the worker is
// ready to accept query_start.
func SpawnWorker(
	ctx context.Context,
	sessionID, cwd, dataDir, workerPath string,
	logger *logfx.Logger,
) (WorkerHandle, error) {
	if workerPath == "" {
		// Check NOSKILLS_WORKER_PATH env; fall back to binary sibling.
		if p := os.Getenv("NOSKILLS_WORKER_PATH"); p != "" {
			workerPath = p
		} else {
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

	// Determine runner command. .ts files → tsx; .js/.mjs → node.
	var runCmd string

	var runArgs []string

	if strings.HasSuffix(workerPath, ".ts") {
		if _, err := exec.LookPath("tsx"); err == nil {
			runCmd = "tsx"
		} else {
			runCmd = "node"
			runArgs = append(runArgs, "--loader", "tsx")
		}
	} else {
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

func (w *workerImpl) send(msg any) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	return w.enc.Encode(msg) //nolint:wrapcheck
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

func (w *workerImpl) StopTask() error {
	return w.send(map[string]string{"type": "stop_task"})
}

func (w *workerImpl) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()

	_ = w.send(map[string]string{"type": "shutdown"})
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

func min(a, b int) int {
	if a < b {
		return a
	}

	return b
}

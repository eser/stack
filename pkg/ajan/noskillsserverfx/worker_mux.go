package noskillsserverfx

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/eser/stack/pkg/ajan/logfx"
)

// ── Mux worker ────────────────────────────────────────────────────────────────

// workerWriteTimeout bounds each write to a mux worker's socket. The socket is
// local and the worker drains it as frames arrive, so a write that waits this
// long means the worker has stopped reading.
const workerWriteTimeout = 5 * time.Second

// ErrWorkerStalled is wrapped by every send to a mux worker after a write
// timed out part-way through a frame. The connection is closed at that point,
// which ends the worker and its session.
var ErrWorkerStalled = errors.New("worker stopped reading")

// shutdownFrame asks the mux worker to exit; Close sends it.
var shutdownFrame = []byte(`{"type":"shutdown"}` + "\n") //nolint:gochecknoglobals // constant bytes

type workerImpl struct {
	sessionID string
	conn      net.Conn
	// lines reads conn for waitForReady and then for readLoop. It is one
	// scanner for both because a scanner reads ahead: the worker sends ready
	// and its next line together, and a second scanner would never see what
	// the first had buffered.
	lines *bufio.Scanner
	// events is closed by the reader alone, once the socket ends.
	events chan WorkerEvent

	// stopProcess ends the worker process: it cancels the context the command
	// was started with. The process outlives the attach request that spawned
	// it, so only Close (or a stalled write) calls this.
	stopProcess context.CancelFunc

	// writeTimeout bounds each socket write: workerWriteTimeout, shorter in
	// tests.
	writeTimeout time.Duration

	// mu serialises writes, so frames never interleave on the socket, and
	// guards writeErr.
	mu sync.Mutex
	// writeErr is set once a write has left part of a frame on the socket. The
	// worker reads newline-delimited JSON, so nothing sent after a fragment
	// could be parsed; every later send returns writeErr at once.
	writeErr error
}

// newMuxWorker wraps a connected mux worker. stopProcess ends its process; nil
// means there is no process to end (tests).
func newMuxWorker(sessionID string, conn net.Conn, stopProcess context.CancelFunc) *workerImpl {
	if stopProcess == nil {
		stopProcess = func() {}
	}

	lines := bufio.NewScanner(conn)
	lines.Buffer(make([]byte, workerMaxLine), workerMaxLine)

	return &workerImpl{ //nolint:exhaustruct
		sessionID:    sessionID,
		conn:         conn,
		lines:        lines,
		events:       make(chan WorkerEvent, 256), //nolint:mnd // room for a burst of worker lines while the pump catches up
		stopProcess:  stopProcess,
		writeTimeout: workerWriteTimeout,
	}
}

// workerMaxLine is the longest line the daemon reads from a mux worker. A
// longer one ends the session (see readLoop).
const workerMaxLine = 1 << 20

// workerDrainTimeout bounds how long the reader may run after the worker
// process has exited. The worker's end of the socket closes with the process,
// so the reader normally ends at once, after delivering the last lines the
// worker wrote.
const workerDrainTimeout = 5 * time.Second

// run starts the goroutines that serve a ready worker: the reader, which
// turns socket lines into events and closes Events when the socket ends, and
// the waiter, which waits for the process to exit through waitProcess and
// then makes sure the reader ends too.
//
// Only the reader closes Events. The waiter used to close it as soon as the
// process exited, while the reader could still be delivering the worker's
// last lines, and a send on the closed channel panicked and took the daemon
// down.
func (w *workerImpl) run(ctx context.Context, logger *logfx.Logger, waitProcess func() error) {
	readDone := make(chan struct{})

	go func() {
		defer close(readDone)

		w.readLoop(ctx, logger)
	}()

	go func() {
		waitErr := waitProcess()
		if waitErr != nil && ctx.Err() == nil {
			// Not ended by Close, so the worker failed on its own.
			logger.WarnContext(ctx, "mux worker exited", "sid", w.sessionID, "err", waitErr)
		}

		w.stopProcess() // releases the process context

		// A child the worker started can inherit its end of the socket and
		// keep it open. Closing ours ends the read then.
		timer := time.NewTimer(workerDrainTimeout)
		defer timer.Stop()

		select {
		case <-readDone:
		case <-timer.C:
			_ = w.conn.Close() // the read ends with the close; it reports nothing new
		}
	}()
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

	scanner := w.lines

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

func (w *workerImpl) readLoop(ctx context.Context, logger *logfx.Logger) {
	scanner := w.lines

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var msg struct {
			Type string `json:"type"`
		}

		if err := json.Unmarshal([]byte(line), &msg); err != nil {
			logger.WarnContext(ctx, "worker: malformed message", "sid", w.sessionID, "line", line[:min(len(line), 200)])

			continue
		}

		w.events <- WorkerEvent{Type: msg.Type, Payload: []byte(line)}
	}

	// ctx ends when the worker is being ended on purpose, and a read cut off
	// by that is expected. Any other read error, such as a line over the
	// buffer, ends the session the same way an exit does.
	if err := scanner.Err(); err != nil && ctx.Err() == nil {
		logger.WarnContext(ctx, "mux worker: read failed, ending the session", "sid", w.sessionID, "err", err)
	}

	// The only close of w.events: run explains why.
	close(w.events)
}

// send writes msg to the worker as one JSON line.
//
// Nothing is sent when ctx has already ended. The write must finish within
// w.writeTimeout, or by ctx's deadline when that is sooner, so a worker that
// stops reading holds the caller, and anyone queued behind it on w.mu, for a
// bounded time only. A write already under way is not interrupted when ctx is
// cancelled: a cut frame ends the session (see writeFrameLocked), and the
// write ends within the bound anyway.
func (w *workerImpl) send(ctx context.Context, msg any) error {
	frame, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("encode message for worker %s: %w", w.sessionID, err)
	}

	frame = append(frame, '\n')

	w.mu.Lock()
	defer w.mu.Unlock()

	if err := ctx.Err(); err != nil {
		return fmt.Errorf("write to worker %s: %w", w.sessionID, err)
	}

	deadline := time.Now().Add(w.writeTimeout)
	if ctxDeadline, ok := ctx.Deadline(); ok && ctxDeadline.Before(deadline) {
		deadline = ctxDeadline
	}

	return w.writeFrameLocked(frame, deadline)
}

// writeFrameLocked writes one frame before deadline. The caller holds w.mu,
// which is a plain sync.Mutex and not reentrant.
//
// A write that fails part-way through a frame leaves a fragment the worker
// cannot parse, and anything sent after it would be read as part of that
// fragment. The connection is closed and the process ended instead, which
// ends the session; every later write returns the same error at once.
func (w *workerImpl) writeFrameLocked(frame []byte, deadline time.Time) error {
	if w.writeErr != nil {
		return w.writeErr
	}

	if err := w.conn.SetWriteDeadline(deadline); err != nil {
		return fmt.Errorf("write to worker %s: set deadline: %w", w.sessionID, err)
	}

	n, err := w.conn.Write(frame)
	if err == nil {
		return nil
	}

	if n == 0 {
		// Nothing reached the socket, so the stream is still intact.
		return fmt.Errorf("write to worker %s: %w", w.sessionID, err)
	}

	w.writeErr = fmt.Errorf("%w: worker %s took %d of %d bytes of a frame: %w",
		ErrWorkerStalled, w.sessionID, n, len(frame), err)

	_ = w.conn.Close() // the worker is being ended; its read side reports the close
	w.stopProcess()

	return w.writeErr
}

// SendQueryStart sends query_start.
func (w *workerImpl) SendQueryStart(ctx context.Context, cwd, sessionID, resume string) error {
	type queryStart struct {
		Type      string `json:"type"`
		Cwd       string `json:"cwd"`
		SessionID string `json:"sessionId"`
		Resume    string `json:"resume,omitempty"`
	}

	return w.send(ctx, queryStart{
		Type:      "query_start",
		Cwd:       cwd,
		SessionID: sessionID,
		Resume:    resume,
	})
}

func (w *workerImpl) PushMessage(ctx context.Context, content string) error {
	return w.send(ctx, map[string]string{"type": "push_message", "content": content})
}

func (w *workerImpl) PermissionResponse(ctx context.Context, requestID, behavior, message string) error {
	type resp struct {
		Type      string `json:"type"`
		RequestID string `json:"requestId"`
		Behavior  string `json:"behavior"`
		Message   string `json:"message,omitempty"`
	}

	return w.send(ctx, resp{
		Type:      "permission_response",
		RequestID: requestID,
		Behavior:  behavior,
		Message:   message,
	})
}

func (w *workerImpl) SendMux(ctx context.Context, frame json.RawMessage) error {
	// {"type":"mux","frame":<frontend frame>} — the mux worker delivers `frame`
	// straight to its mux server.
	return w.send(ctx, struct {
		Type  string          `json:"type"`
		Frame json.RawMessage `json:"frame"`
	}{Type: "mux", Frame: frame})
}

// SetMode forwards the request to the worker.
//
// The mux worker has no mode concept and ignores unknown messages, so today
// this reaches nothing. It is still sent rather than dropped here: the daemon
// should not be the component that decides a worker cannot do something, and a
// worker that grows the capability needs no change on this side.
func (w *workerImpl) SetMode(ctx context.Context, mode string) error {
	return w.send(ctx, map[string]string{"type": "set_mode", "mode": mode})
}

func (w *workerImpl) StopTask(ctx context.Context) error {
	return w.send(ctx, map[string]string{"type": "stop_task"})
}

// Close asks the worker to shut down, closes the socket and ends the process.
// The shutdown message has the same write deadline as any other, so a worker
// that stopped reading cannot hold Close. Close is safe to call more than once.
func (w *workerImpl) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()

	// writeFrameLocked, not send: we already hold w.mu and it is not
	// reentrant. Its error is not reported: the worker may already be gone,
	// and the process is ended below either way.
	_ = w.writeFrameLocked(shutdownFrame, time.Now().Add(w.writeTimeout))

	closeErr := w.conn.Close()
	w.stopProcess()

	if closeErr != nil && !errors.Is(closeErr, net.ErrClosed) {
		return fmt.Errorf("close worker %s socket: %w", w.sessionID, closeErr)
	}

	return nil
}

func (w *workerImpl) Events() <-chan WorkerEvent {
	return w.events
}

func (w *workerImpl) SessionID() string {
	return w.sessionID
}

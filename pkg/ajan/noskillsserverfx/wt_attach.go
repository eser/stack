package noskillsserverfx

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/logfx"
)

// handleAttach is a RouteRaw handler for /attach/{slug}/{sid}.
// It upgrades the HTTP/3 request to a WebTransport session and brokers
// messages between the WT client and the session's TS worker.
//
// Protocol:
//  1. Upgrade HTTP/3 → WebTransport
//  2. GetOrCreate session (spawn worker + pump goroutine on first attach)
//  3. Accept bidi stream from client
//  4. Register with broadcaster (events buffer while replaying)
//  5. Replay ledger (transcript_replay_start … lines … transcript_replay_end)
//  6. Enter live mode: goroutine forwards worker events; scanner reads client messages
func (s *Server) handleAttach(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	slug := r.PathValue("slug")
	sid := r.PathValue("sid")

	if slug == "" || sid == "" {
		http.Error(w, "missing slug or sid", http.StatusBadRequest)

		return
	}

	// ?after=<n> lets a reconnecting client skip events it has already seen.
	// The value is the last seq the client received (0 = full replay).
	var afterSeq int64
	if afterStr := r.URL.Query().Get("after"); afterStr != "" {
		if n, err := strconv.ParseInt(afterStr, 10, 64); err == nil && n >= 0 {
			afterSeq = n
		}
	}

	// ?kind=mux selects a terminal-multiplexer worker; default is the agent
	// worker. Only honoured on first attach (when the worker is spawned).
	kind := r.URL.Query().Get("kind")

	sess, err := s.h3svc.Upgrader().Upgrade(w, r)
	if errors.Is(err, httpfx.ErrWebTransportOriginNotAllowed) {
		http.Error(w, "WebTransport upgrade refused: origin not allowed", http.StatusForbidden)

		return
	}

	if err != nil {
		http.Error(w, fmt.Sprintf("WebTransport upgrade failed: %v", err), http.StatusBadRequest)

		return
	}

	entry, isNew, err := s.sessions.GetOrCreate(ctx, slug, sid, kind)
	if err != nil {
		_ = sess.CloseWithError(1, fmt.Sprintf("session error: %v", err))

		return
	}

	if isNew {
		if startErr := entry.Worker.SendQueryStart(ctx, entry.Root, sid, ""); startErr != nil {
			// The session is unusable. Drop it so the next attach starts over,
			// and end its worker; the pump then closes the ledger and the
			// broadcaster.
			s.sessions.Remove(slug, sid)

			if closeErr := entry.Worker.Close(); closeErr != nil {
				s.logger.WarnContext(ctx, "wt_attach: close worker after a failed start", "sid", sid, "err", closeErr)
			}

			_ = sess.CloseWithError(1, fmt.Sprintf("worker start failed: %v", startErr))

			return
		}
	}

	// AcceptStream blocks until the client opens a bidi stream.
	stream, err := sess.AcceptStream(ctx)
	if err != nil {
		_ = sess.CloseWithError(1, fmt.Sprintf("stream accept failed: %v", err))

		return
	}

	// Every write to the client goes through out, so a client that stops
	// reading holds a write for attachWriteTimeout at most.
	out := boundedWriter{stream: stream, timeout: attachWriteTimeout}
	enc := json.NewEncoder(out)

	// seq is the per-connection monotonic counter. Replay lines and live events
	// share the same counter so the client sees a single contiguous sequence.
	var seq int64

	// Register with the broadcaster BEFORE replaying the ledger so that any
	// live events arriving during replay are buffered in clientCh (not dropped).
	// The deferred Unregister covers a failed replay and a panic; live mode
	// unregisters before it waits for the forwarder, and Unregister is
	// idempotent.
	clientID := newSessionID()
	clientCh := entry.Broadcaster.Register(clientID)
	defer entry.Broadcaster.Unregister(clientID)

	// closeAfterFailedWrite ends an attach whose client did not take a write.
	// The client has gone, or it stopped reading and is cut off here; there is
	// nobody to answer either way, so this is not logged as an error.
	closeAfterFailedWrite := func(stage string, err error) {
		s.logger.DebugContext(ctx, "wt_attach: write to the client failed, closing the attach",
			"sid", sid, "stage", stage, "err", err)

		_ = sess.CloseWithError(1, "client stopped reading")
	}

	// ── Ledger replay ─────────────────────────────────────────────────────
	// Send historical events so the client can reconstruct prior transcript.
	// The first failed write ends the attach, since every later one would
	// fail the same way.
	writeErr := wtSend(enc, &seq, map[string]any{"type": "transcript_replay_start"})

	if writeErr == nil {
		// replayWithForkAwareness assigns stable 1-based seq numbers to each
		// line. Lines with seq ≤ afterSeq are counted but not sent (reconnect
		// fast-path). The returned totalLines lets the live forwarder continue
		// numbering from there.
		totalLines, replayErr := replayWithForkAwareness(
			ctx, entry.Ledger, s.config.DataDir, entry.Root, afterSeq,
			func(lineSeq int64, line []byte) bool {
				// A forked session replays its parent's ledger first, and a
				// failure there does not stop the replay of its own lines.
				if writeErr != nil {
					return false
				}

				if _, err := out.Write(append(withSeq(line, lineSeq), '\n')); err != nil {
					writeErr = err

					return false
				}

				seq = lineSeq

				return true
			},
		)
		if replayErr != nil && ctx.Err() == nil {
			// The client still gets the live events; its transcript lacks
			// whatever the ledger could not give.
			s.logger.WarnContext(ctx, "wt_attach: ledger replay incomplete", "sid", sid, "err", replayErr)
		}

		// Keep seq in sync with the highest line number even when some were skipped.
		if seq < totalLines {
			seq = totalLines
		}
	}

	if writeErr == nil {
		writeErr = wtSend(enc, &seq, map[string]any{"type": "transcript_replay_end"})
	}

	if writeErr != nil {
		closeAfterFailedWrite("replay", writeErr)

		return
	}

	// ── Live mode ─────────────────────────────────────────────────────────
	// The forwarder sends worker events to the client. It stops when clientCh
	// closes, because the worker exited (broadcaster.Close) or this handler
	// unregistered below, or when a write fails. Either way it closes the
	// WebTransport session, which also ends the read loop below. The handler
	// waits for it, so nothing writes to the stream after the handler returns.
	forwarded := make(chan struct{})

	go func() {
		defer close(forwarded)

		if err := forwardEvents(ctx, enc, &seq, clientCh, s.logger); err != nil {
			closeAfterFailedWrite("live", err)

			return
		}

		// Channel closed → session ended; signal the client.
		_ = sess.CloseWithError(0, "session_ended")
	}()

	// Client → worker: read newline-delimited JSON from the bidi stream.
	// Exits when the WT session is closed (client disconnect or the forwarder).
	scanner := bufio.NewScanner(stream)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}

		dispatchClientMessage(ctx, line, entry, s.logger)
	}

	// Unregistering closes clientCh: the forwarder delivers what is still
	// buffered, each write bounded by attachWriteTimeout, and returns.
	entry.Broadcaster.Unregister(clientID)
	<-forwarded
}

// attachWriteTimeout bounds each write to an attached client. A QUIC stream
// write waits only while the client's flow-control window is full or the
// connection is congested, so a write that waits this long means the client
// stopped reading. Its attach then ends, and the client can reattach with
// ?after=.
const attachWriteTimeout = 30 * time.Second

// deadlineWriter is the write side of an attach stream.
type deadlineWriter interface {
	io.Writer
	SetWriteDeadline(t time.Time) error
}

// boundedWriter gives every Write to stream a deadline timeout from now.
type boundedWriter struct {
	stream  deadlineWriter
	timeout time.Duration
}

func (b boundedWriter) Write(p []byte) (int, error) {
	if err := b.stream.SetWriteDeadline(time.Now().Add(b.timeout)); err != nil {
		return 0, fmt.Errorf("set write deadline: %w", err)
	}

	n, err := b.stream.Write(p)
	if err != nil {
		return n, fmt.Errorf("write to attach stream: %w", err)
	}

	return n, nil
}

// forwardEvents writes each event from events to the client as one JSON line,
// translated to the client wire protocol, until events is closed, which
// returns nil, or a write fails, which returns its error. enc writes through
// a boundedWriter, so a client that stops reading ends the loop within
// attachWriteTimeout.
func forwardEvents(
	ctx context.Context,
	enc *json.Encoder,
	seq *int64,
	events <-chan WorkerEvent,
	logger *logfx.Logger,
) error {
	for evt := range events {
		msg := translateWorkerEvent(ctx, evt, logger)
		if msg == nil {
			continue
		}

		if err := wtSend(enc, seq, msg); err != nil {
			return fmt.Errorf("send %q event: %w", evt.Type, err)
		}
	}

	return nil
}

// wtSend encodes msg to enc, injecting "v":1 and an auto-incremented "seq"
// into every map[string]any message. The seq pointer is shared across the
// entire WebTransport connection so replay and live events form one contiguous
// sequence visible to the client for reconnect fast-path (?after=<seq>).
// The ledger format itself remains version- and seq-free.
func wtSend(enc *json.Encoder, seq *int64, msg any) error {
	if m, ok := msg.(map[string]any); ok {
		*seq++
		m["v"] = 1
		m["seq"] = *seq
	}

	return enc.Encode(msg)
}

// withSeq splices a "seq" field into a raw JSON object line immediately after
// the opening '{'. The line must start with '{'; other values are returned
// unchanged. Used to stamp sequence numbers onto verbatim ledger replay bytes
// without a full parse-and-re-encode cycle.
func withSeq(line []byte, seq int64) []byte {
	if len(line) < 2 || line[0] != '{' {
		return line
	}

	prefix := fmt.Appendf(nil, `{"seq":%d,`, seq)

	return append(prefix, line[1:]...)
}

// dispatchClientMessage parses one JSON line from the client and routes it to
// the appropriate WorkerHandle method. ctx is the attach request's context, so
// a call to the worker ends when the client disconnects.
//
// Errors are logged here because this is where they are handled: the client
// protocol has no reply for these messages.
func dispatchClientMessage(
	ctx context.Context,
	line string,
	entry *SessionEntry,
	logger *logfx.Logger,
) {
	var raw struct {
		Type     string          `json:"type"`
		Content  string          `json:"content,omitempty"`
		ID       string          `json:"id,omitempty"`
		Decision string          `json:"decision,omitempty"`
		Message  string          `json:"message,omitempty"`
		Mode     string          `json:"mode,omitempty"`
		Model    string          `json:"model,omitempty"`
		Frame    json.RawMessage `json:"frame,omitempty"`
	}

	if err := json.Unmarshal([]byte(line), &raw); err != nil {
		logger.WarnContext(ctx, "wt_attach: malformed client message",
			"sid", entry.SID, "line", line[:min(len(line), 200)])

		return
	}

	switch raw.Type {
	case "user_message":
		if err := entry.Worker.PushMessage(ctx, raw.Content); err != nil {
			logger.WarnContext(ctx, "wt_attach: user_message not queued", "sid", entry.SID, "err", err)
		}
	case "permission_response":
		dispatchPermissionResponse(ctx, entry, raw.ID, raw.Decision, raw.Message, logger)
	case "mux":
		if err := entry.Worker.SendMux(ctx, raw.Frame); err != nil {
			logger.WarnContext(ctx, "wt_attach: mux frame not sent", "sid", entry.SID, "err", err)
		}
	case "set_permission_mode":
		if err := entry.Worker.SetMode(ctx, raw.Mode); err != nil {
			logger.WarnContext(ctx, "wt_attach: set_permission_mode failed",
				"sid", entry.SID, "mode", raw.Mode, "err", err)
		}
	case "set_model":
		// Declared by the client protocol, with no analogue in ACP v1 -- the
		// draft moves this to session/set_config_option. Logged rather than
		// dropped in silence, so a client that sends it can find out why nothing
		// happened instead of concluding the daemon ignored a working command.
		logger.WarnContext(ctx, "wt_attach: set_model is not supported by the agent protocol",
			"sid", entry.SID, "model", raw.Model)
	case "stop", "abort":
		if err := entry.Worker.StopTask(ctx); err != nil {
			logger.WarnContext(ctx, "wt_attach: stop failed", "sid", entry.SID, "err", err)
		}
	}
}

// dispatchPermissionResponse validates a decision, journals it with the
// durability its tool requires, and only then lets the worker act on it.
//
// Two things changed here, both of them safety properties that were stated in
// comments elsewhere in this package but not actually in force:
//
// An unrecognised decision -- including the empty string a truncated or
// malformed client message produces -- used to be rewritten to "allow". That
// granted a permission the user was never asked about. It is now rejected and
// the client is told, using the permission_response_rejected event the protocol
// already defines for exactly this.
//
// The decision is journalled before the worker hears it. Ledger.AppendSync's
// own comment says "the worker must not execute a write tool until the decision
// is on disk"; until now nothing called it, so the ordering it describes did not
// exist. If the sync fails the decision is not forwarded at all -- running the
// tool with no durable record is the state the contract forbids.
func dispatchPermissionResponse(
	ctx context.Context,
	entry *SessionEntry,
	requestID, decision, message string,
	logger *logfx.Logger,
) {
	if !validPermissionDecisions[decision] {
		logger.WarnContext(ctx,
			"wt_attach: rejecting permission response",
			"sid", entry.SID, "id", requestID, "decision", decision,
		)

		entry.Broadcaster.Broadcast(WorkerEvent{
			Type: "permission_response_rejected",
			Payload: rejectionPayload(
				requestID, decision, "unrecognised decision",
			),
		})

		return
	}

	if !journalPermissionDecision(entry, requestID, decision) {
		logger.WarnContext(ctx, "wt_attach: permission decision did not reach disk",
			"sid", entry.SID, "id", requestID)

		entry.Broadcaster.Broadcast(WorkerEvent{
			Type: "permission_response_rejected",
			Payload: rejectionPayload(
				requestID, decision, "decision could not be journalled",
			),
		})

		return
	}

	if err := entry.Worker.PermissionResponse(ctx, requestID, decision, message); err != nil {
		// The decision is on disk; the worker has not heard it. The client
		// sees no rejection because the decision itself was valid.
		logger.WarnContext(ctx, "wt_attach: permission decision not delivered to the worker",
			"sid", entry.SID, "id", requestID, "err", err)
	}
}

// rejectionPayload builds the client-wire bytes for a refused decision.
func rejectionPayload(requestID, decision, reason string) []byte {
	payload, err := json.Marshal(map[string]any{
		"type":     "permission_response_rejected",
		"id":       requestID,
		"decision": decision,
		"reason":   reason,
	})
	if err != nil {
		return []byte(`{"type":"permission_response_rejected"}`)
	}

	return payload
}

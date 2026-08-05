package noskillsserverfx

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

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
			s.sessions.Remove(slug, sid)
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

	enc := json.NewEncoder(stream)

	// seq is the per-connection monotonic counter. Replay lines and live events
	// share the same counter so the client sees a single contiguous sequence.
	var seq int64

	// Register with the broadcaster BEFORE replaying the ledger so that any
	// live events arriving during replay are buffered in clientCh (not dropped).
	clientID := newSessionID()
	clientCh := entry.Broadcaster.Register(clientID)
	defer entry.Broadcaster.Unregister(clientID)

	// ── Ledger replay ─────────────────────────────────────────────────────
	// Send historical events so the client can reconstruct prior transcript.
	_ = wtSend(enc, &seq, map[string]any{"type": "transcript_replay_start"})

	// replayWithForkAwareness assigns stable 1-based seq numbers to each line.
	// Lines with seq ≤ afterSeq are counted but not sent (reconnect fast-path).
	// The returned totalLines lets the live goroutine continue numbering from there.
	totalLines, _ := replayWithForkAwareness(
		ctx, entry.Ledger, s.config.DataDir, entry.Root, afterSeq,
		func(lineSeq int64, line []byte) bool {
			injected := withSeq(line, lineSeq)
			_, werr := stream.Write(append(injected, '\n'))
			if werr == nil {
				seq = lineSeq
			}

			return werr == nil
		},
	)

	// Keep seq in sync with the highest line number even when some were skipped.
	if seq < totalLines {
		seq = totalLines
	}

	_ = wtSend(enc, &seq, map[string]any{"type": "transcript_replay_end"})

	// ── Live mode ─────────────────────────────────────────────────────────
	// Goroutine: worker → client. Reads from the per-client broadcaster channel.
	// When the channel is closed (broadcaster.Close → worker exited), the
	// goroutine closes the WT session which causes the scanner below to exit.
	go func() {
		for evt := range clientCh {
			msg := translateWorkerEvent(evt, s.logger)
			if msg != nil {
				_ = wtSend(enc, &seq, msg)
			}
		}

		// Channel closed → session ended; signal the client.
		_ = sess.CloseWithError(0, "session_ended")
	}()

	// Client → worker: read newline-delimited JSON from the bidi stream.
	// Exits when the WT session is closed (client disconnect or goroutine above).
	scanner := bufio.NewScanner(stream)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}

		dispatchClientMessage(line, entry, s.logger)
	}
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
// the appropriate WorkerHandle method.
func dispatchClientMessage(line string, entry *SessionEntry, logger *logfx.Logger) {
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
		logger.Warn("wt_attach: malformed client message", "line", line[:min(len(line), 200)])

		return
	}

	switch raw.Type {
	case "user_message":
		_ = entry.Worker.PushMessage(raw.Content)
	case "permission_response":
		dispatchPermissionResponse(entry, raw.ID, raw.Decision, raw.Message, logger)
	case "mux":
		_ = entry.Worker.SendMux(raw.Frame)
	case "set_permission_mode":
		if err := entry.Worker.SetMode(raw.Mode); err != nil {
			logger.Warn("wt_attach: set_permission_mode failed", "mode", raw.Mode, "err", err)
		}
	case "set_model":
		// Declared by the client protocol, with no analogue in ACP v1 -- the
		// draft moves this to session/set_config_option. Logged rather than
		// dropped in silence, so a client that sends it can find out why nothing
		// happened instead of concluding the daemon ignored a working command.
		logger.Warn("wt_attach: set_model is not supported by the agent protocol",
			"model", raw.Model)
	case "stop", "abort":
		_ = entry.Worker.StopTask()
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
	entry *SessionEntry,
	requestID, decision, message string,
	logger *logfx.Logger,
) {
	if !validPermissionDecisions[decision] {
		logger.Warn(
			"wt_attach: rejecting permission response",
			"id", requestID, "decision", decision,
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
		logger.Warn("wt_attach: permission decision did not reach disk", "id", requestID)

		entry.Broadcaster.Broadcast(WorkerEvent{
			Type: "permission_response_rejected",
			Payload: rejectionPayload(
				requestID, decision, "decision could not be journalled",
			),
		})

		return
	}

	_ = entry.Worker.PermissionResponse(requestID, decision, message)
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

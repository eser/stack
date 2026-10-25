package noskillsserverfx

import (
	"context"
	"encoding/json"

	"github.com/eser/stack/pkg/ajan/logfx"
)

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
// already defines for exactly this; the rejection is journalled like any
// other event a client gets.
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
			"sid", entry.SID, "id", clipEchoed(requestID), "decision", clipEchoed(decision),
		)

		rejectPermissionResponse(ctx, entry, requestID, decision, "unrecognised decision", logger)

		return
	}

	if !journalPermissionDecision(entry, requestID, decision) {
		logger.WarnContext(ctx, "wt_attach: permission decision did not reach disk",
			"sid", entry.SID, "id", clipEchoed(requestID))

		rejectPermissionResponse(ctx, entry, requestID, decision, "decision could not be journalled", logger)

		return
	}

	if err := entry.Worker.PermissionResponse(ctx, requestID, decision, message); err != nil {
		// The decision is on disk; the worker has not heard it. The client
		// sees no rejection because the decision itself was valid.
		logger.WarnContext(ctx, "wt_attach: permission decision not delivered to the worker",
			"sid", entry.SID, "id", requestID, "err", err)
	}
}

// rejectPermissionResponse journals a refused decision and tells the attached
// clients. The ledger keeps it as the record that a client answered a request
// and the daemon did not act on the answer, next to the request it answered;
// a client that reattaches sees why its answer had no effect. When the ledger
// refuses the line, the clients are still told.
func rejectPermissionResponse(
	ctx context.Context,
	entry *SessionEntry,
	requestID, decision, reason string,
	logger *logfx.Logger,
) {
	payload := rejectionPayload(requestID, decision, reason)
	evt := WorkerEvent{Type: "permission_response_rejected", Payload: payload}

	if err := entry.publishOrSend(evt, payload); err != nil {
		logger.WarnContext(ctx, "wt_attach: permission response rejection not journalled",
			"sid", entry.SID, "id", clipEchoed(requestID), "err", err)
	}
}

// maxEchoedField bounds a client's value the daemon echoes in a rejection:
// it is client input, written to the ledger and the log. A request id and a
// decision the daemon accepts are far shorter.
const maxEchoedField = 128

// clipEchoed cuts s to maxEchoedField bytes. A cut through a multi-byte
// character is encoded as U+FFFD by encoding/json.
func clipEchoed(s string) string {
	if len(s) <= maxEchoedField {
		return s
	}

	return s[:maxEchoedField]
}

// rejectionPayload builds the client-wire bytes for a refused decision.
func rejectionPayload(requestID, decision, reason string) []byte {
	payload, err := json.Marshal(map[string]any{
		"type":     "permission_response_rejected",
		"id":       clipEchoed(requestID),
		"decision": clipEchoed(decision),
		"reason":   reason,
	})
	if err != nil {
		return []byte(`{"type":"permission_response_rejected"}`)
	}

	return payload
}

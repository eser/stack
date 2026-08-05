package noskillsserverfx

import (
	"context"
	"encoding/json"

	"github.com/eser/stack/pkg/ajan/acpfx"
)

// The permission half of the ACP worker: turning session/request_permission
// into the daemon's own requestId-correlated round-trip and back again.

// RequestPermission routes an ACP permission request into the daemon's existing
// round-trip and blocks until the user answers.
//
// This is the join the migration exists to make. The daemon already had a
// requestId-correlated permission protocol, hand-rolled against the SDK's
// canUseTool; ACP's session/request_permission is the same exchange with a
// different envelope. Emitting the daemon's own permission_request shape means
// the WebTransport path, the ledger and every UI that renders a prompt keep
// working with no change at all.
func (w *acpWorker) RequestPermission(
	ctx context.Context,
	req *acpfx.RequestPermissionRequest,
) (acpfx.PermissionOutcome, error) {
	requestID := newSessionID()
	reply := make(chan string, 1)

	w.mu.Lock()
	w.pending[requestID] = reply
	w.mu.Unlock()

	defer func() {
		w.mu.Lock()
		delete(w.pending, requestID)
		w.mu.Unlock()
	}()

	w.emit(map[string]any{
		"type":      "permission_request",
		"requestId": requestID,
		"toolName":  req.ToolCall.Title,
		"input":     rawOrNull(req.ToolCall.RawInput),
		"toolUseId": req.ToolCall.ToolCallID,
		// The agent's own options, so a UI can offer exactly what it offered
		// rather than guessing from a three-value behavior string. Additive.
		"options": req.Options,
		"kind":    req.ToolCall.Kind,
	})

	select {
	case behavior := <-reply:
		return resolvePermission(behavior, req.Options), nil

	case <-ctx.Done():
		return acpfx.CancelPermission(), nil

	case <-w.done:
		return acpfx.CancelPermission(), nil
	}
}

// rawOrNull keeps a nil RawInput from marshalling as the literal "null" string
// inside the event, which a consumer would have to special-case.
func rawOrNull(raw json.RawMessage) any {
	if len(raw) == 0 {
		return map[string]any{}
	}

	return raw
}

// resolvePermission maps the daemon's behavior string onto an option the agent
// actually offered.
//
// A client cannot invent an outcome in ACP: it must select an OptionID from the
// request or cancel. So an unmappable behavior CANCELS rather than allows --
// the failure direction matters here, and the daemon's own path had this
// backwards (an empty decision defaulted to "allow").
//
// deny_remember gets a distinct meaning for the first time: it maps to
// reject_always, where the old path forwarded the string verbatim as a behavior
// the SDK did not recognise.
func resolvePermission(behavior string, options []acpfx.PermissionOption) acpfx.PermissionOutcome {
	var wanted []acpfx.PermissionOptionKind

	switch behavior {
	case "allow", "allow_once":
		wanted = []acpfx.PermissionOptionKind{
			acpfx.PermissionAllowOnce, acpfx.PermissionAllowAlways,
		}

	case "allow_always", "allow_remember":
		wanted = []acpfx.PermissionOptionKind{
			acpfx.PermissionAllowAlways, acpfx.PermissionAllowOnce,
		}

	case "deny", "reject", "reject_once":
		wanted = []acpfx.PermissionOptionKind{
			acpfx.PermissionRejectOnce, acpfx.PermissionRejectAlways,
		}

	case "deny_remember", "reject_always":
		wanted = []acpfx.PermissionOptionKind{
			acpfx.PermissionRejectAlways, acpfx.PermissionRejectOnce,
		}

	default:
		// Includes the empty string. Cancelling is the safe direction: the agent
		// does not run the tool, and the user is not silently taken to have
		// approved something they never saw.
		return acpfx.CancelPermission()
	}

	for _, kind := range wanted {
		for _, option := range options {
			if option.Kind == kind {
				return acpfx.SelectOption(option.OptionID)
			}
		}
	}

	return acpfx.CancelPermission()
}

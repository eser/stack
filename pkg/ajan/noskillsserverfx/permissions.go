package noskillsserverfx

import (
	"encoding/json"
	"sync"
)

// maxPendingPermissions bounds the outstanding-request table.
//
// Entries are removed when a decision arrives, so this only fills up with
// requests nobody ever answered. The number is far above any real prompt queue;
// it exists so an agent that asks and asks cannot grow daemon memory without
// limit. Overflow is safe by construction: a request with no remembered tool is
// classified as a write, which is the more durable path.
const maxPendingPermissions = 1024

// pendingPermissions remembers which tool each outstanding permission request
// is for.
//
// The daemon needs this because the two halves of the exchange arrive
// separately: the tool name comes from the worker on permission_request, and
// the decision comes from a client on permission_response, which carries only
// the request id. Without the join there is nothing to classify, which is why
// ClassifyTool sat unused and the durability contract it exists for was never
// in force.
type pendingPermissions struct {
	mu    sync.Mutex
	tools map[string]string
}

func newPendingPermissions() *pendingPermissions {
	return &pendingPermissions{tools: make(map[string]string)} //nolint:exhaustruct
}

// record notes the tool a request is asking about.
func (p *pendingPermissions) record(requestID, toolName string) {
	if requestID == "" {
		return
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	if len(p.tools) >= maxPendingPermissions {
		return
	}

	p.tools[requestID] = toolName
}

// take returns and forgets the tool a request was asking about.
//
// An unknown id yields "", which ClassifyTool treats as a write. That is the
// intended direction: an unrecognised request is journalled durably rather than
// cheaply.
func (p *pendingPermissions) take(requestID string) string {
	p.mu.Lock()
	defer p.mu.Unlock()

	tool := p.tools[requestID]
	delete(p.tools, requestID)

	return tool
}

// permissionRequestTool extracts the tool name from a permission_request event.
//
// Both spellings are accepted because the wire has both: the worker emits
// "toolName", while the published client type declares "tool".
func permissionRequestTool(payload []byte) (string, string) {
	var event struct {
		RequestID string `json:"requestId"`
		ID        string `json:"id"`
		ToolName  string `json:"toolName"`
		Tool      string `json:"tool"`
	}

	if err := json.Unmarshal(payload, &event); err != nil {
		return "", ""
	}

	requestID := event.RequestID
	if requestID == "" {
		requestID = event.ID
	}

	toolName := event.ToolName
	if toolName == "" {
		toolName = event.Tool
	}

	return requestID, toolName
}

// validPermissionDecisions is the set a client may send.
//
// Anything else is rejected rather than interpreted. The previous behaviour --
// defaulting an empty decision to "allow" -- meant a malformed or truncated
// client message granted a permission the user was never asked about.
var validPermissionDecisions = map[string]bool{ //nolint:gochecknoglobals
	"allow":         true,
	"allow_always":  true,
	"deny":          true,
	"deny_remember": true,
}

// journalPermissionDecision records a decision in the ledger with the
// durability its tool requires, and reports whether it reached disk.
//
// For a write tool this is a synchronous append: the contract on Ledger.
// AppendSync is that "the worker must not execute a write tool until the
// decision is on disk", so a crash between the user's decision and the tool
// running leaves the ledger showing an unanswered prompt rather than an
// answered-but-unexecuted one. Read-only tools take the cheap path -- losing
// the record of an approved Grep costs nothing.
//
// A failed sync returns false and the caller does not forward the decision.
// Forwarding anyway would be the exact state the contract forbids.
func journalPermissionDecision(entry *SessionEntry, requestID, decision string) bool {
	tool := entry.Pending.take(requestID)

	// Classified once, then used for both the branch and the record. Two calls
	// would let the class written to the ledger drift from the durability
	// actually applied, which is the kind of disagreement nothing would notice.
	class := ClassifyTool(tool)

	line, err := json.Marshal(map[string]any{
		"type":     "permission_decision",
		"id":       requestID,
		"tool":     tool,
		"decision": decision,
		"class":    class,
	})
	if err != nil {
		return false
	}

	if class == "read" {
		_ = entry.Ledger.Append(line)

		return true
	}

	return entry.Ledger.AppendSync(line) == nil
}

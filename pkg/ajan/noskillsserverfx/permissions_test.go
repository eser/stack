package noskillsserverfx

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/logfx"
)

// recordingWorker observes what the daemon does at the moment it tells the
// worker about a decision.
type recordingWorker struct {
	MockWorkerHandle

	// onPermission runs inside PermissionResponse, so it observes the world as
	// the worker would: anything not yet done has not been done.
	onPermission func(requestID, behavior string)

	calls []string
}

func (r *recordingWorker) PermissionResponse(requestID, behavior, _ string) error {
	r.calls = append(r.calls, requestID+":"+behavior)

	if r.onPermission != nil {
		r.onPermission(requestID, behavior)
	}

	return nil
}

// newDecisionEntry builds a session entry backed by a real on-disk ledger.
func newDecisionEntry(t *testing.T, worker WorkerHandle) (*SessionEntry, string) {
	t.Helper()

	path := filepath.Join(t.TempDir(), "ledger.jsonl")

	ledger, err := openLedger(path)
	if err != nil {
		t.Fatalf("openLedger: %v", err)
	}

	t.Cleanup(func() { _ = ledger.Close() })

	return &SessionEntry{ //nolint:exhaustruct
		SID:         "sess-1",
		Worker:      worker,
		Ledger:      ledger,
		Broadcaster: newFanoutBroadcaster(),
		Pending:     newPendingPermissions(),
	}, path
}

// TestWriteToolDecisionIsOnDiskBeforeTheWorkerActs pins the durability contract
// that Ledger.AppendSync was written for and that nothing enforced.
//
// Its own comment states it: "the worker must not execute a write tool until
// the decision is on disk", so that a crash in between leaves the ledger
// showing an unanswered prompt rather than an approval for a tool that never
// ran. ClassifyTool existed to drive this and had no production call site, so
// the ordering did not exist -- decisions went straight to the worker and were
// never journalled at all.
//
// The assertion reads the file from inside PermissionResponse, which is exactly
// the instant the worker learns of the decision. Reading it afterwards would
// pass whether or not the write came first.
func TestWriteToolDecisionIsOnDiskBeforeTheWorkerActs(t *testing.T) {
	var onDisk string

	worker := &recordingWorker{} //nolint:exhaustruct

	entry, path := newDecisionEntry(t, worker)

	worker.onPermission = func(_, _ string) {
		data, err := os.ReadFile(path) //nolint:gosec // a path this test just built
		if err != nil {
			t.Errorf("read ledger: %v", err)

			return
		}

		onDisk = string(data)
	}

	entry.Pending.record("req-1", "Write")

	dispatchPermissionResponse(entry, "req-1", "allow", "", logfx.NewLogger())

	if len(worker.calls) != 1 {
		t.Fatalf("worker calls = %v, want the decision forwarded once", worker.calls)
	}

	if !strings.Contains(onDisk, `"id":"req-1"`) {
		t.Fatalf(
			"the worker was told before the decision reached disk; ledger held %q", onDisk,
		)
	}

	var decision map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(onDisk)), &decision); err != nil {
		t.Fatalf("ledger line is not JSON: %v", err)
	}

	if decision["class"] != "write" {
		t.Fatalf("Write was journalled as %v, want the write class", decision["class"])
	}
}

// TestDurabilityFollowsTheToolClass pins that the split is a real split.
//
// It asserts on Ledger.Syncs rather than on the bytes in the file, because the
// two paths leave identical bytes: a first version of this test read the file
// back and checked the recorded class, which passed unchanged against a
// deliberately broken branch that sent every decision down the cheap path. The
// fsync is the whole difference, so the fsync is what has to be counted.
func TestDurabilityFollowsTheToolClass(t *testing.T) {
	cases := []struct {
		tool      string
		wantSyncs int64
	}{
		{tool: "Write", wantSyncs: 1},
		{tool: "Bash", wantSyncs: 1},
		{tool: "", wantSyncs: 1}, // unknown -- the durable direction
		{tool: "Grep", wantSyncs: 0},
		{tool: "Read", wantSyncs: 0},
	}

	for _, tc := range cases {
		worker := &recordingWorker{} //nolint:exhaustruct

		entry, path := newDecisionEntry(t, worker)

		entry.Pending.record("req-2", tc.tool)

		dispatchPermissionResponse(entry, "req-2", "allow", "", logfx.NewLogger())

		if got := entry.Ledger.Syncs(); got != tc.wantSyncs {
			t.Fatalf("tool %q caused %d fdatasyncs, want %d", tc.tool, got, tc.wantSyncs)
		}

		// The record must still be there either way -- the cheap path is a
		// weaker guarantee, not an absent one.
		data, err := os.ReadFile(path) //nolint:gosec // a path this test just built
		if err != nil {
			t.Fatalf("read ledger: %v", err)
		}

		var decision map[string]any
		if err := json.Unmarshal([]byte(strings.TrimSpace(string(data))), &decision); err != nil {
			t.Fatalf("ledger line for %q is not JSON: %v", tc.tool, err)
		}

		if decision["decision"] != "allow" {
			t.Fatalf("tool %q journalled %v, want the decision", tc.tool, decision["decision"])
		}
	}
}

// TestUnknownToolIsTreatedAsAWrite pins the direction of the unknown case.
//
// A tool nobody classified, or a request id the daemon has no record of, must
// take the durable path. The cheap path is an optimisation, and applying it to
// something unrecognised trades a safety property for nothing.
func TestUnknownToolIsTreatedAsAWrite(t *testing.T) {
	for _, tool := range []string{"", "SomeFutureTool"} {
		if got := ClassifyTool(tool); got != "write" {
			t.Fatalf("ClassifyTool(%q) = %q, want write", tool, got)
		}
	}
}

// TestMalformedDecisionIsRejectedNotAllowed pins the fail-open fix.
//
// dispatchClientMessage used to rewrite an empty decision to "allow", so a
// truncated or malformed client message granted a permission the user was never
// asked about. The decision must not reach the worker at all, and the client
// must be told why.
func TestMalformedDecisionIsRejectedNotAllowed(t *testing.T) {
	for _, decision := range []string{"", "yes", "ALLOW", "allow "} {
		worker := &recordingWorker{} //nolint:exhaustruct

		entry, path := newDecisionEntry(t, worker)

		client := entry.Broadcaster.Register("client-1")

		entry.Pending.record("req-3", "Write")

		dispatchPermissionResponse(entry, "req-3", decision, "", logfx.NewLogger())

		if len(worker.calls) != 0 {
			t.Fatalf("decision %q reached the worker: %v", decision, worker.calls)
		}

		data, _ := os.ReadFile(path) //nolint:gosec // a path this test just built
		if len(data) != 0 {
			t.Fatalf("decision %q was journalled: %q", decision, string(data))
		}

		select {
		case evt := <-client:
			if evt.Type != "permission_response_rejected" {
				t.Fatalf("decision %q produced a %s event", decision, evt.Type)
			}
		default:
			t.Fatalf("decision %q was dropped silently", decision)
		}
	}
}

// TestValidDecisionsAllReachTheWorker guards the rejection test from becoming a
// blanket refusal.
//
// A validator that rejected everything would satisfy the test above while
// breaking the feature entirely.
func TestValidDecisionsAllReachTheWorker(t *testing.T) {
	for _, decision := range []string{"allow", "allow_always", "deny", "deny_remember"} {
		worker := &recordingWorker{} //nolint:exhaustruct

		entry, _ := newDecisionEntry(t, worker)

		entry.Pending.record("req-4", "Write")

		dispatchPermissionResponse(entry, "req-4", decision, "", logfx.NewLogger())

		if len(worker.calls) != 1 {
			t.Fatalf("valid decision %q did not reach the worker", decision)
		}
	}
}

// TestPermissionRequestToolAcceptsBothWireSpellings pins the join between the
// two halves of the exchange.
//
// The worker emits "toolName" while the published client type declares "tool",
// so a reader that knows only one of them silently classifies every tool as
// unknown -- which looks like it works, because unknown means write.
func TestPermissionRequestToolAcceptsBothWireSpellings(t *testing.T) {
	cases := []struct {
		payload  string
		wantID   string
		wantTool string
	}{
		{`{"requestId":"a","toolName":"Write"}`, "a", "Write"},
		{`{"id":"b","tool":"Read"}`, "b", "Read"},
		{`{"requestId":"c","toolName":"Bash","toolUseId":"tu"}`, "c", "Bash"},
	}

	for _, tc := range cases {
		gotID, gotTool := permissionRequestTool([]byte(tc.payload))
		if gotID != tc.wantID || gotTool != tc.wantTool {
			t.Fatalf(
				"permissionRequestTool(%s) = (%q, %q), want (%q, %q)",
				tc.payload, gotID, gotTool, tc.wantID, tc.wantTool,
			)
		}
	}
}

// TestPendingPermissionsIsBounded pins that agent-controlled input cannot grow
// the table without limit.
func TestPendingPermissionsIsBounded(t *testing.T) {
	pending := newPendingPermissions()

	for i := range maxPendingPermissions + 500 {
		pending.record(string(rune('a'+i%26))+strings.Repeat("x", i%7)+itoa(i), "Write")
	}

	pending.mu.Lock()
	size := len(pending.tools)
	pending.mu.Unlock()

	if size > maxPendingPermissions {
		t.Fatalf("pending table grew to %d, past the %d cap", size, maxPendingPermissions)
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}

	var digits []byte

	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}

	return string(digits)
}

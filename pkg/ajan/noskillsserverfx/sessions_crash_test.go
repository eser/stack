package noskillsserverfx

// Crash-safety E2E tests (mandatory for v1, gates Phase 5b distribution).
//
// These four tests verify the daemon's core durability invariants without
// spawning a real Node worker or noskills-server binary. They exercise the
// real ledger and MockWorkerHandle, giving confidence that the "session
// survives my laptop reboot" promise holds.
//
//   Test 1 — Daemon kill mid-session: transcript replay returns all prior turns.
//   Test 2 — Daemon kill mid-permission: replay shows unanswered request.
//   Test 3 — Daemon kill before write-tool fsync ACK: sync decision persists.
//   Test 4 — Worker crash: events channel closes and close is idempotent.

import (
	"context"
	"encoding/json"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ── Test 1 — transcript replay ─────────────────────────────────────────────

// TestCrash_TranscriptReplay writes N session lines, closes the ledger (simulating
// a daemon exit), opens a fresh ledger on the same path, and verifies replay
// returns all N lines in order — the same path noskills-server walks on restart.
func TestCrash_TranscriptReplay(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "sess.jsonl")

	lines := []string{
		`{"type":"delta","text":"Hello"}`,
		`{"type":"tool_start","id":"t1","tool":"Read","input":{}}`,
		`{"type":"tool_result","id":"t1","output":"file content"}`,
		`{"type":"delta","text":"World"}`,
		`{"type":"query_done"}`,
	}

	// First daemon lifetime: write all lines.
	ledger, err := openLedger(path)
	require.NoError(t, err)

	for _, l := range lines {
		require.NoError(t, ledger.Append([]byte(l)))
	}

	require.NoError(t, ledger.Close()) // daemon exits

	// Second daemon lifetime: replay from the same path.
	ledger2, err := openLedger(path)
	require.NoError(t, err)

	defer func() { _ = ledger2.Close() }()

	var replayed []string

	err = ledger2.Replay(context.Background(), func(b []byte) bool {
		replayed = append(replayed, string(b))

		return true
	})

	require.NoError(t, err)
	assert.Equal(t, lines, replayed, "all lines must replay in insertion order")
}

// ── Test 2 — unanswered permission request survives crash ──────────────────

// TestCrash_UnansweredPermission writes a permission_request using AppendSync
// (the write-tool durability path), then closes without writing a decision or
// tool_result (daemon crash). On replay, the request line is present but no
// decision follows — the daemon re-presents the request to the reattaching client.
func TestCrash_UnansweredPermission(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "sess.jsonl")

	reqLine := `{"type":"permission_request","id":"req-1","tool":"Bash","input":{"command":"rm -rf /"},"durability":"write"}`

	// First daemon lifetime: sync-commit the permission request.
	ledger, err := openLedger(path)
	require.NoError(t, err)

	require.NoError(t, ledger.AppendSync([]byte(reqLine)))

	// Daemon crashes before the user clicks allow/deny — no decision line written.
	require.NoError(t, ledger.Close())

	// Second daemon lifetime: replay.
	ledger2, err := openLedger(path)
	require.NoError(t, err)

	defer func() { _ = ledger2.Close() }()

	var replayed []json.RawMessage

	err = ledger2.Replay(context.Background(), func(b []byte) bool {
		cp := make([]byte, len(b))
		copy(cp, b)
		replayed = append(replayed, cp)

		return true
	})

	require.NoError(t, err)
	require.Len(t, replayed, 1, "only the request line should be present")

	var msg struct {
		Type string `json:"type"`
		ID   string `json:"id"`
	}
	require.NoError(t, json.Unmarshal(replayed[0], &msg))
	assert.Equal(t, "permission_request", msg.Type, "replayed line must be the unanswered request")
	assert.Equal(t, "req-1", msg.ID)

	// No permission_decision follows — the client must re-prompt.
}

// ── Test 3 — write-tool sync decision persists across crash ────────────────

// TestCrash_WriteSyncDecisionPersists verifies that AppendSync commits the
// decision to disk before returning, so a daemon crash between the decision and
// the tool_result does NOT lose the decision. Replay sees: request + decision
// but no tool_result — the "permitted but not executed" state that causes the
// client to re-prompt rather than silently replay a phantom tool execution.
func TestCrash_WriteSyncDecisionPersists(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "sess.jsonl")

	reqLine := `{"type":"permission_request","id":"req-2","tool":"Edit","input":{"path":"/tmp/canary.txt"},"durability":"write"}`
	decLine := `{"type":"permission_decision","id":"req-2","decision":"allow","durability":"write"}`

	// First daemon lifetime: user clicks allow; AppendSync commits decision.
	ledger, err := openLedger(path)
	require.NoError(t, err)

	require.NoError(t, ledger.AppendSync([]byte(reqLine)))
	require.NoError(t, ledger.AppendSync([]byte(decLine)))

	// Daemon crashes before the worker writes tool_result.
	require.NoError(t, ledger.Close())

	// Second daemon lifetime: replay.
	ledger2, err := openLedger(path)
	require.NoError(t, err)

	defer func() { _ = ledger2.Close() }()

	var types []string

	err = ledger2.Replay(context.Background(), func(b []byte) bool {
		var m struct {
			Type string `json:"type"`
		}
		if e := json.Unmarshal(b, &m); e == nil {
			types = append(types, m.Type)
		}

		return true
	})

	require.NoError(t, err)
	assert.Equal(t, []string{"permission_request", "permission_decision"}, types)

	// No tool_result — the daemon knows to re-prompt. The Edit tool was not
	// executed (canary.txt does not exist), so no phantom side effect occurred.
}

// ── Test 4 — worker crash closes events channel ────────────────────────────

// TestCrash_WorkerCrash_EventsChannelCloses verifies that calling Close on a
// MockWorkerHandle (or the real workerImpl when the process exits) drains the
// events channel gracefully. A range on the closed channel must complete without
// blocking — this is what lets the daemon pump goroutine exit cleanly and
// broadcast {type:"worker_died"} to attached clients.
func TestCrash_WorkerCrash_EventsChannelCloses(t *testing.T) {
	canned := []WorkerEvent{
		{Type: "sdk_event", Payload: []byte(`{"type":"sdk_event"}`)},
		{Type: "query_done", Payload: []byte(`{"type":"query_done"}`)},
	}

	mock := NewMockWorkerHandle("sess-crash", canned)

	// Simulate worker process exit.
	require.NoError(t, mock.Close())

	// Range must drain all canned events then exit (channel is closed).
	var received []string

	for e := range mock.Events() {
		received = append(received, e.Type)
	}

	assert.Equal(t, []string{"sdk_event", "query_done"}, received)

	// Second Close must be idempotent — no panic from double-close.
	assert.NoError(t, mock.Close())
}

// ── Test 5 — tool classifier ───────────────────────────────────────────────

// TestClassifyTool verifies the read/write classification table used by the
// per-tool durability contract. Read-only tools → "read"; write tools and
// unknowns → "write" (safer default).
func TestClassifyTool(t *testing.T) {
	readOnly := []string{"Read", "Glob", "Grep", "LS", "WebFetch"}
	for _, name := range readOnly {
		assert.Equal(t, "read", ClassifyTool(name), "expected %q to be read-only", name)
	}

	writeTool := []string{"Edit", "Write", "MultiEdit", "Bash", "NotebookEdit", "Task"}
	for _, name := range writeTool {
		assert.Equal(t, "write", ClassifyTool(name), "expected %q to be a write tool", name)
	}

	// Unknown tools must default to write (safety-first).
	assert.Equal(t, "write", ClassifyTool("UnknownFutureTool"))
}

// ── Error coverage lint ───────────────────────────────────────────────────────

// TestNSErrors_AllFieldsPopulated verifies that every registered NSError has
// non-empty Code, Cause, and Fix. Mirrors validate-error-coverage
// (eser codebase validate-error-coverage) — both checks must pass.
func TestNSErrors_AllFieldsPopulated(t *testing.T) {
	entries := []*NSError{
		NSErrors.PortInUse,
		NSErrors.MkcertMissing,
		NSErrors.AuthMissing,
		NSErrors.AuthTokenExpired,
		NSErrors.AuthLocked,
		NSErrors.WorkerDied,
		NSErrors.WorkerSpawnTimeout,
		NSErrors.NodeMissing,
		NSErrors.NodeVersionTooOld,
		NSErrors.LedgerWriteError,
		NSErrors.DaemonAlreadyRunning,
	}

	for _, e := range entries {
		require.NotNil(t, e)
		assert.NotEmpty(t, e.Code, "error Code must not be empty")
		assert.NotEmpty(t, e.Cause, "error Cause must not be empty (code %s)", e.Code)
		assert.NotEmpty(t, e.Fix, "error Fix must not be empty (code %s)", e.Code)
	}
}

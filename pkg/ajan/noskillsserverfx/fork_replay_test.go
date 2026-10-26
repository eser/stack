package noskillsserverfx

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// addLedgerSession registers a running session of project "proj" under root
// whose ledger sits where the daemon keeps it, so a fork finds its parent's.
func (f *attachFixture) addLedgerSession(t *testing.T, sid, root string, worker WorkerHandle) *SessionEntry {
	t.Helper()

	ledger, err := openLedger(ledgerPath(f.srv.config.DataDir, root, sid))
	require.NoError(t, err)

	entry := &SessionEntry{ //nolint:exhaustruct
		SID:         sid,
		Slug:        "proj",
		Root:        root,
		Worker:      worker,
		Ledger:      ledger,
		Broadcaster: newFanoutBroadcaster(),
		Pending:     newPendingPermissions(),
	}

	f.srv.sessions.mu.Lock()
	f.srv.sessions.addLocked(sessionKey(entry.Slug, sid), entry)
	f.srv.sessions.mu.Unlock()

	return entry
}

// numbered returns texts as replayed lines numbered from first.
func numbered(first int64, texts ...string) []replayed {
	lines := make([]replayed, 0, len(texts))

	for i, text := range texts {
		lines = append(lines, replayed{text: text, seq: first + int64(i)})
	}

	return lines
}

// TestForkReplayEndsAtTheForkPoint pins that a fork replays its parent up to
// where it branched off, however much the parent grows afterwards: the fork's
// replay and seq numbers stay the same, a reconnect with ?after= gets exactly
// the fork's lines it missed, and the fork_created line the parent journals
// for the fork is not part of the fork's history.
func TestForkReplayEndsAtTheForkPoint(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	t.Parallel()

	tests := []struct {
		name        string
		atMessageID string
		// parentReplay is the texts of the parent lines the fork replays.
		parentReplay []string
	}{
		{
			name:         "a fork at the parent's tail",
			atMessageID:  "",
			parentReplay: []string{"one", "two", "three"},
		},
		{
			name:         "a fork at a message",
			atMessageID:  "m2",
			parentReplay: []string{"one", "two"},
		},
		{
			name:         "a fork at a message the parent does not hold",
			atMessageID:  "m9",
			parentReplay: []string{"one", "two", "three"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			f := startAttachFixture(t)
			root := t.TempDir()
			parent := f.addLedgerSession(t, "s-parent", root, NewMockWorkerHandle("s-parent", nil))

			for _, line := range []string{
				`{"type":"sdk_event","id":"m1","text":"one"}`,
				`{"type":"sdk_event","id":"m2","text":"two"}`,
				`{"type":"sdk_event","id":"m3","text":"three"}`,
			} {
				require.NoError(t, parent.Ledger.Append([]byte(line)))
			}

			forkSid, err := forkSession(t.Context(), f.srv.sessions, "proj", "s-parent", tt.atMessageID, "")
			require.NoError(t, err, "fork the session")

			// The parent goes on after the fork, which the fork never sees.
			require.NoError(t, parent.Ledger.Append([]byte(`{"type":"sdk_event","id":"m4","text":"parent-after"}`)))

			worker := NewMockWorkerHandle(forkSid, nil)
			fork := f.addLedgerSession(t, forkSid, root, worker)
			require.NoError(t, fork.Ledger.Append([]byte(`{"type":"sdk_event","text":"fork-one"}`)))

			parentLines := int64(len(tt.parentReplay))
			history := append(numbered(1, tt.parentReplay...), numbered(parentLines+1, "fork-one")...)

			first := f.attachAfter(t, forkSid, 0)
			assert.Equal(t, history, first.replay(t), "the fork replays its parent up to the fork point, then its own lines")

			require.NoError(t, parent.Ledger.Append([]byte(`{"type":"sdk_event","id":"m5","text":"parent-later"}`)))

			worker.Push(ledgerEvent("fork-two"))
			first.expect(t, seqLine{Type: "sdk_event", Text: "fork-two"}) //nolint:exhaustruct
			assert.Equal(t, parentLines+2, first.lastSeq, "a live fork event is numbered after the fork's history")

			require.NoError(t, first.sess.Close())
			f.waitForHandlerReturn(t)

			// The fork misses one of its own events while the parent grows.
			require.NoError(t, parent.Ledger.Append([]byte(`{"type":"sdk_event","id":"m6","text":"parent-even-later"}`)))
			worker.Push(ledgerEvent("fork-three"))
			waitForLedgerEvent(t, fork, "fork-three")

			second := f.attachAfter(t, forkSid, first.lastSeq)
			assert.Equal(t, numbered(parentLines+3, "fork-three"), second.replay(t),
				"a reconnect gets exactly the fork line it missed")

			require.NoError(t, second.sess.Close())
			f.waitForHandlerReturn(t)

			third := f.attachAfter(t, forkSid, 0)
			assert.Equal(t, append(history, numbered(parentLines+2, "fork-two", "fork-three")...), third.replay(t),
				"a full replay numbers the fork's history as the first one did")

			require.NoError(t, third.sess.Close())
			f.waitForHandlerReturn(t)
		})
	}
}

// TestForkReplayReadsTheForkPointFromTheMetadata pins the fork_meta header a
// fork's ledger starts with, which is all a restarted daemon has to go on: a
// header that records the parent's line count replays that many parent
// lines, and one written before the count was recorded replays the parent as
// it did then, to the message it names or to the parent's end.
func TestForkReplayReadsTheForkPointFromTheMetadata(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		header string
		want   []string
	}{
		{
			name:   "the parent's line count",
			header: `{"type":"fork_meta","parent_session_id":"s-parent","fork_at_message_id":"","parent_lines":2,"created_at":"2026-01-02T03:04:05Z"}`,
			want:   []string{"one", "two", "fork-one"},
		},
		{
			name:   "no parent lines at the fork",
			header: `{"type":"fork_meta","parent_session_id":"s-parent","fork_at_message_id":"","parent_lines":0,"created_at":"2026-01-02T03:04:05Z"}`,
			want:   []string{"fork-one"},
		},
		{
			name:   "the line count and a message before it",
			header: `{"type":"fork_meta","parent_session_id":"s-parent","fork_at_message_id":"m1","parent_lines":2,"created_at":"2026-01-02T03:04:05Z"}`,
			want:   []string{"one", "fork-one"},
		},
		{
			name:   "an older header without the count",
			header: `{"type":"fork_meta","parent_session_id":"s-parent","fork_at_message_id":"","created_at":"2026-01-02T03:04:05Z"}`,
			want:   []string{"one", "two", "three", "fork-one"},
		},
		{
			name:   "an older header with a message",
			header: `{"type":"fork_meta","parent_session_id":"s-parent","fork_at_message_id":"m2","created_at":"2026-01-02T03:04:05Z"}`,
			want:   []string{"one", "two", "fork-one"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			dataDir, root := t.TempDir(), t.TempDir()
			parentPath := ledgerPath(dataDir, root, "s-parent")
			require.NoError(t, os.MkdirAll(filepath.Dir(parentPath), 0o700))
			require.NoError(t, os.WriteFile(parentPath, []byte(
				`{"type":"sdk_event","id":"m1","text":"one"}`+"\n"+
					`{"type":"sdk_event","id":"m2","text":"two"}`+"\n"+
					`{"type":"sdk_event","id":"m3","text":"three"}`+"\n"), 0o600))

			// The fork's ledger as a restarted daemon opens it.
			forkPath := ledgerPath(dataDir, root, "s-fork")
			require.NoError(t, os.WriteFile(forkPath, []byte(
				tt.header+"\n"+`{"type":"sdk_event","text":"fork-one"}`+"\n"), 0o600))

			ledger, err := openLedger(forkPath)
			require.NoError(t, err)
			t.Cleanup(func() { _ = ledger.Close() })

			var got []string

			total, own, err := replayWithForkAwareness(context.Background(), ledger, dataDir, root, 0,
				func(seq int64, line []byte) bool {
					var parsed seqLine

					require.NoError(t, json.Unmarshal(line, &parsed))
					assert.Equal(t, int64(len(got)+1), seq, "line %q", line)
					got = append(got, parsed.Text)

					return true
				})
			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
			assert.Equal(t, int64(len(tt.want)), total, "lines the replay numbered")
			assert.Equal(t, int64(2), own, "lines of the fork's own ledger it covered")
		})
	}
}

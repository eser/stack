package noskillsserverfx

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestForkOfAForkReplaysItsWholeAncestry pins that a fork of a fork replays
// the root up to where the parent branched off it, then the parent up to
// where the fork branched off, then its own lines, with no fork_meta header
// sent as an event, however much the ancestors grow; seq numbers stay the
// same across reconnects. An ancestor whose ledger is gone ends the walk up
// the ancestry, and the lines below it are numbered from 1.
func TestForkOfAForkReplaysItsWholeAncestry(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	t.Parallel()

	tests := []struct {
		name string
		// parentAt is the message the parent forks off the root at.
		parentAt string
		// childAt is the message the fork of the fork forks off the parent at.
		childAt string
		// removeRoot deletes the root's ledger once both forks exist.
		removeRoot bool
		// history is the texts the fork of the fork replays before its own.
		history []string
	}{
		{
			name:    "forks at the tails",
			history: []string{"one", "two", "three", "p-one", "p-two"},
		},
		{
			name:     "a parent forked at a message",
			parentAt: "m2",
			history:  []string{"one", "two", "p-one", "p-two"},
		},
		{
			name:    "a fork at a message the parent has from the root",
			childAt: "m2",
			history: []string{"one", "two"},
		},
		{
			name:     "a fork at a message of the parent",
			parentAt: "m2",
			childAt:  "p1",
			history:  []string{"one", "two", "p-one"},
		},
		{
			name:       "a root whose ledger is gone",
			removeRoot: true,
			history:    []string{"p-one", "p-two"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			f := startAttachFixture(t)
			root := t.TempDir()

			appendLine := func(t *testing.T, entry *SessionEntry, line string) {
				t.Helper()

				require.NoError(t, entry.Ledger.Append([]byte(line)))
			}

			rootEntry := f.addLedgerSession(t, "s-root", root, NewMockWorkerHandle("s-root", nil))
			appendLine(t, rootEntry, `{"type":"sdk_event","id":"m1","text":"one"}`)
			appendLine(t, rootEntry, `{"type":"sdk_event","id":"m2","text":"two"}`)
			appendLine(t, rootEntry, `{"type":"sdk_event","id":"m3","text":"three"}`)

			parentSid, err := forkSession(t.Context(), f.srv.sessions, "proj", "s-root", tt.parentAt, "")
			require.NoError(t, err, "fork the root")
			appendLine(t, rootEntry, `{"type":"sdk_event","id":"m4","text":"root-after"}`)

			parent := f.addLedgerSession(t, parentSid, root, NewMockWorkerHandle(parentSid, nil))
			appendLine(t, parent, `{"type":"sdk_event","id":"p1","text":"p-one"}`)
			appendLine(t, parent, `{"type":"sdk_event","id":"p2","text":"p-two"}`)

			childSid, err := forkSession(t.Context(), f.srv.sessions, "proj", parentSid, tt.childAt, "")
			require.NoError(t, err, "fork the fork")

			// grow appends a line to every ancestor, which the fork never sees.
			grow := func(t *testing.T, text string) {
				t.Helper()

				appendLine(t, rootEntry, `{"type":"sdk_event","text":"root-`+text+`"}`)
				appendLine(t, parent, `{"type":"sdk_event","text":"parent-`+text+`"}`)
			}

			grow(t, "after-the-fork")

			if tt.removeRoot {
				require.NoError(t, os.Remove(ledgerPath(f.srv.config.DataDir, root, "s-root")))
			}

			worker := NewMockWorkerHandle(childSid, nil)
			child := f.addLedgerSession(t, childSid, root, worker)
			appendLine(t, child, `{"type":"sdk_event","text":"f-one"}`)

			before := int64(len(tt.history))
			history := append(numbered(1, tt.history...), numbered(before+1, "f-one")...)

			first := f.attachAfter(t, childSid, 0)
			assert.Equal(t, history, first.replay(t), "the fork replays its ancestry, then its own lines")

			grow(t, "during-the-attach")

			worker.Push(ledgerEvent("f-two"))
			first.expect(t, seqLine{Type: "sdk_event", Text: "f-two"}) //nolint:exhaustruct
			assert.Equal(t, before+2, first.lastSeq, "a live event is numbered after the fork's history")

			require.NoError(t, first.sess.Close())
			f.waitForHandlerReturn(t)

			grow(t, "while-away")
			worker.Push(ledgerEvent("f-three"))
			waitForLedgerEvent(t, child, "f-three")

			second := f.attachAfter(t, childSid, first.lastSeq)
			assert.Equal(t, numbered(before+3, "f-three"), second.replay(t),
				"a reconnect gets exactly the fork line it missed")

			require.NoError(t, second.sess.Close())
			f.waitForHandlerReturn(t)

			third := f.attachAfter(t, childSid, 0)
			assert.Equal(t, append(history, numbered(before+2, "f-two", "f-three")...), third.replay(t),
				"a full replay numbers the history as the first one did")

			require.NoError(t, third.sess.Close())
			f.waitForHandlerReturn(t)
		})
	}
}

// writeLedger writes a ledger of project root under dataDir holding lines.
func writeLedger(t *testing.T, dataDir, root, sid string, lines ...string) string {
	t.Helper()

	path := ledgerPath(dataDir, root, sid)
	require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o700))

	var content []byte
	for _, line := range lines {
		content = append(append(content, line...), '\n')
	}

	require.NoError(t, os.WriteFile(path, content, 0o600))

	return path
}

// forkHeader is a fork_meta header as daemons before parent_lines wrote it.
func forkHeader(parent string) string {
	return `{"type":"fork_meta","parent_session_id":"` + parent + `","fork_at_message_id":"","created_at":"2026-01-02T03:04:05Z"}`
}

// replayTexts replays the ledger at path as an attach does and returns the
// texts of the lines sent, checking that they are numbered from 1 and that
// none is a fork_meta header.
func replayTexts(t *testing.T, dataDir, root, path string) ([]string, error) {
	t.Helper()

	ledger, err := openLedger(path)
	require.NoError(t, err)
	t.Cleanup(func() { _ = ledger.Close() })

	var texts []string

	total, _, err := replayWithForkAwareness(context.Background(), ledger, dataDir, root, 0,
		func(seq int64, line []byte) bool {
			var parsed seqLine

			require.NoError(t, json.Unmarshal(line, &parsed))
			assert.NotEqual(t, "fork_meta", parsed.Type, "a header was sent as an event")
			assert.Equal(t, int64(len(texts)+1), seq, "line %q", line)
			texts = append(texts, parsed.Text)

			return true
		})
	assert.Equal(t, int64(len(texts)), total, "lines the replay numbered")

	return texts, err
}

// TestForkReplayEndsAtABrokenAncestry pins that an ancestry the replay cannot
// walk to its root ends the walk with an errForkAncestry error, which the
// attach logs, and still replays the lines below the break.
func TestForkReplayEndsAtABrokenAncestry(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		// ancestors are the ledgers above the fork, by session id.
		ancestors map[string][]string
		// parent is the session the fork's header names.
		parent string
		want   []string
	}{
		{
			name:   "a parent whose ledger is gone",
			parent: "s-gone",
			want:   []string{"fork-one"},
		},
		{
			name:   "a fork that names itself as its parent",
			parent: "s-fork",
			want:   []string{"fork-one"},
		},
		{
			name: "a cycle above the fork",
			ancestors: map[string][]string{
				"s-a": {forkHeader("s-b"), `{"type":"sdk_event","text":"a-one"}`},
				"s-b": {forkHeader("s-a"), `{"type":"sdk_event","text":"b-one"}`},
			},
			parent: "s-a",
			want:   []string{"b-one", "a-one", "fork-one"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			dataDir, root := t.TempDir(), t.TempDir()

			for sid, lines := range tt.ancestors {
				writeLedger(t, dataDir, root, sid, lines...)
			}

			path := writeLedger(t, dataDir, root, "s-fork", forkHeader(tt.parent), `{"type":"sdk_event","text":"fork-one"}`)

			got, err := replayTexts(t, dataDir, root, path)
			require.ErrorIs(t, err, errForkAncestry)
			assert.Equal(t, tt.want, got)
		})
	}
}

// TestForkReplayBoundsTheAncestryDepth pins that a replay walks up through
// maxForkDepth ancestors at most: a deeper ancestry ends at the bound with an
// errForkAncestry error, the lines below it replayed.
func TestForkReplayBoundsTheAncestryDepth(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		ancestors int
		wantErr   bool
	}{
		{name: "as many ancestors as the bound", ancestors: maxForkDepth, wantErr: false},
		{name: "one ancestor past the bound", ancestors: maxForkDepth + 1, wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			dataDir, root := t.TempDir(), t.TempDir()
			sid := func(i int) string { return "s-" + strconv.Itoa(i) }
			text := func(i int) string { return `{"type":"sdk_event","text":"` + strconv.Itoa(i) + `"}` }

			// Session 0 is the root, session i a fork of session i-1, and the
			// replayed fork is session tt.ancestors.
			writeLedger(t, dataDir, root, sid(0), text(0))

			for i := 1; i < tt.ancestors; i++ {
				writeLedger(t, dataDir, root, sid(i), forkHeader(sid(i-1)), text(i))
			}

			path := writeLedger(t, dataDir, root, sid(tt.ancestors), forkHeader(sid(tt.ancestors-1)), text(tt.ancestors))

			first := 0
			if tt.wantErr {
				first = 1 // the root is past the bound
			}

			want := make([]string, 0, tt.ancestors+1)
			for i := first; i <= tt.ancestors; i++ {
				want = append(want, strconv.Itoa(i))
			}

			got, err := replayTexts(t, dataDir, root, path)
			if tt.wantErr {
				require.ErrorIs(t, err, errForkAncestry)
			} else {
				require.NoError(t, err)
			}

			assert.Equal(t, want, got)
		})
	}
}

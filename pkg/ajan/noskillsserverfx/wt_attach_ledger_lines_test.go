package noskillsserverfx

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ledgerLineCount returns how many lines the session's ledger holds.
func ledgerLineCount(entry *SessionEntry) (int, error) {
	count := 0
	err := entry.Ledger.Replay(context.Background(), func([]byte) bool {
		count++

		return true
	})

	return count, err
}

// waitForLedgerEvent waits until the session's ledger holds the sdk_event
// with text.
func waitForLedgerEvent(t *testing.T, entry *SessionEntry, text string) {
	t.Helper()

	require.Eventually(t, func() bool {
		found := false
		err := entry.Ledger.Replay(context.Background(), func(raw []byte) bool {
			var line seqLine

			found = json.Unmarshal(raw, &line) == nil && line.Type == "sdk_event" && line.Text == text

			return !found
		})

		return err == nil && found
	}, 10*time.Second, 10*time.Millisecond, "the ledger never held the sdk_event %q", text)
}

// readUntil reads lines until the sdk_event with text and returns every line
// read on the way, that one included.
func (c *seqClient) readUntil(t *testing.T, text string) []seqLine {
	t.Helper()

	var lines []seqLine

	for {
		line := c.next(t)
		lines = append(lines, line)

		if line.Type == "sdk_event" && line.Text == text {
			return lines
		}
	}
}

// TestAttachEventsCarryTheirLedgerLine pins that every event a client is sent
// carries the number of the ledger line it was written as, whatever wrote it
// and whenever, so a client that reconnects with the last seq it saw gets the
// ledger lines it missed: none twice and none skipped.
//
// Each case makes the daemon send or journal one event outside the session
// pump's own events while a client is attached, then the client sees one more
// live event, leaves, misses one, and reconnects.
func TestAttachEventsCarryTheirLedgerLine(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	t.Parallel()

	tests := []struct {
		name string
		// lines is how many ledger lines the session holds once the client
		// has left and missed one event: two before the attach, the case's
		// own, "three" and the missed "four".
		lines int64
		// beforeReplay runs once, between the first attach's registration
		// for live events and its read of the ledger.
		beforeReplay func(t *testing.T, worker *MockWorkerHandle, entry *SessionEntry)
		// during runs while the first client is attached, after its replay,
		// and returns once the event it causes has been journalled or sent.
		during func(t *testing.T, f *attachFixture, worker *MockWorkerHandle, entry *SessionEntry, client *seqClient)
	}{
		{
			name:  "a rejected permission response",
			lines: 5,
			during: func(t *testing.T, _ *attachFixture, _ *MockWorkerHandle, _ *SessionEntry, client *seqClient) {
				t.Helper()

				client.send(t, `{"type":"permission_response","id":"req-1","decision":"maybe"}`)
				client.expect(t, seqLine{Type: "permission_response_rejected"}) //nolint:exhaustruct
			},
		},
		{
			name:  "a fork of the session",
			lines: 5,
			during: func(t *testing.T, f *attachFixture, _ *MockWorkerHandle, entry *SessionEntry, client *seqClient) {
				t.Helper()

				_, err := forkSession(t.Context(), f.srv.sessions, entry.Slug, entry.SID, "", "")
				require.NoError(t, err, "fork the session")
				client.expect(t, seqLine{Type: "fork_created"}) //nolint:exhaustruct
			},
		},
		{
			name:  "a permission decision",
			lines: 6,
			during: func(t *testing.T, _ *attachFixture, worker *MockWorkerHandle, entry *SessionEntry, client *seqClient) {
				t.Helper()

				worker.Push(WorkerEvent{
					Type:    "permission_request",
					Payload: []byte(`{"type":"permission_request","requestId":"req-1","toolName":"Read"}`),
				})
				client.expect(t, seqLine{Type: "permission_request"}) //nolint:exhaustruct

				client.send(t, `{"type":"permission_response","id":"req-1","decision":"allow"}`)
				waitForLedgerLines(t, entry, 4)
			},
		},
		{
			name:  "an event journalled while the attach starts its replay",
			lines: 5,
			beforeReplay: func(t *testing.T, worker *MockWorkerHandle, entry *SessionEntry) {
				t.Helper()

				// This runs in the attach handler, so it reports instead of
				// stopping the test.
				worker.Push(ledgerEvent("late"))

				deadline := time.Now().Add(10 * time.Second)
				for {
					if count, err := ledgerLineCount(entry); err == nil && count == 3 {
						return
					}

					if time.Now().After(deadline) {
						t.Errorf("the pump never journalled the event pushed before the replay")

						return
					}

					time.Sleep(10 * time.Millisecond)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			f := startAttachFixture(t)
			worker := NewMockWorkerHandle("s-lines", nil)
			entry := f.addWorkerSession(t, "s-lines", worker)

			require.NoError(t, entry.Ledger.Append([]byte(`{"type":"sdk_event","text":"one"}`)))
			require.NoError(t, entry.Ledger.Append([]byte(`{"type":"sdk_event","text":"two"}`)))

			if tt.beforeReplay != nil {
				var once sync.Once

				entry.Broadcaster.mu.Lock()
				entry.Broadcaster.onRegister = func() {
					once.Do(func() { tt.beforeReplay(t, worker, entry) })
				}
				entry.Broadcaster.mu.Unlock()
			}

			first := f.attachAfter(t, entry.SID, 0)
			seen := make(map[string]int64)

			// remember records a line the client got, and reports a ledger
			// event it got twice.
			remember := func(kind, text string, seq int64) {
				key := kind + ":" + text
				if earlier, ok := seen[key]; ok {
					t.Errorf("the client got %s %q twice, with seq %d and %d", kind, text, earlier, seq)
				}

				seen[key] = seq
			}

			for _, line := range first.replay(t) {
				remember("sdk_event", line.text, line.seq)
			}

			if tt.during != nil {
				tt.during(t, f, worker, entry, first)
			}

			worker.Push(ledgerEvent("three"))

			for _, line := range first.readUntil(t, "three") {
				if line.Seq != nil {
					remember(line.Type, line.Text, *line.Seq)
				}
			}

			assert.Equal(t, tt.lines-1, first.lastSeq, "the last seq the client saw is the line of the last event it got")

			require.NoError(t, first.sess.Close())
			f.waitForHandlerReturn(t)

			// The event the client misses while it is away.
			worker.Push(ledgerEvent("four"))
			waitForLedgerEvent(t, entry, "four")

			second := f.attachAfter(t, entry.SID, first.lastSeq)
			assert.Equal(t, []replayed{{text: "four", seq: tt.lines}}, second.replay(t),
				"a reconnect gets exactly the ledger line it missed")

			worker.Push(ledgerEvent("five"))
			second.expect(t, seqLine{Type: "sdk_event", Text: "five"}) //nolint:exhaustruct
			assert.Equal(t, tt.lines+1, second.lastSeq, "the next live event carries the next ledger line")

			require.NoError(t, second.sess.Close())
			f.waitForHandlerReturn(t)
		})
	}
}

package noskillsserverfx

import (
	"bufio"
	"context"
	"encoding/json"
	"strconv"
	"testing"
	"time"

	ajanwebtransport "github.com/eser/stack/pkg/ajan/webtransport"
	wt "github.com/quic-go/webtransport-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeRemoteMuxWorker is a MockWorkerHandle that is also a remoteMuxWorker:
// it hands each joined socket to the test, which sends the mux frames.
type fakeRemoteMuxWorker struct {
	*MockWorkerHandle

	joined chan muxSocket
}

func newFakeRemoteMuxWorker(sid string) *fakeRemoteMuxWorker {
	return &fakeRemoteMuxWorker{
		MockWorkerHandle: NewMockWorkerHandle(sid, nil),
		joined:           make(chan muxSocket, 1),
	}
}

func (w *fakeRemoteMuxWorker) joinRemote(socket muxSocket) { w.joined <- socket }

func (w *fakeRemoteMuxWorker) leaveRemote(muxSocket) {}

// seqLine is a line the daemon sends on an attach stream, with the fields
// a reconnecting client reads.
type seqLine struct {
	Type string `json:"type"`
	Seq  *int64 `json:"seq"`
	Text string `json:"text"`
}

// seqClient is one attach of a test client that keeps the last seq it saw,
// as noskills-client and mux_remote.js do.
type seqClient struct {
	sess    *ajanwebtransport.Session
	stream  *wt.Stream
	scanner *bufio.Scanner
	lastSeq int64
}

// attachAfter attaches to sid with ?after=after (0 sends no ?after=).
func (f *attachFixture) attachAfter(t *testing.T, sid string, after int64) *seqClient {
	t.Helper()

	url := f.baseURL + sid
	if after > 0 {
		url += "?after=" + strconv.FormatInt(after, 10)
	}

	sess, err := f.client.ConnectWithHeaders(t.Context(), url, f.headers)
	require.NoError(t, err, "attach")

	stream, err := sess.OpenBidiStreamSync(t.Context())
	require.NoError(t, err)

	// The daemon sees the stream only once it carries data; its reader skips
	// an empty line.
	_, err = stream.Write([]byte("\n"))
	require.NoError(t, err)
	require.NoError(t, stream.SetReadDeadline(time.Now().Add(10*time.Second)))

	return &seqClient{sess: sess, stream: stream, scanner: bufio.NewScanner(stream), lastSeq: after}
}

// send writes one client message line to the daemon.
func (c *seqClient) send(t *testing.T, line string) {
	t.Helper()

	_, err := c.stream.Write([]byte(line + "\n"))
	require.NoError(t, err, "send %q", line)
}

// next reads one line and keeps its seq when it carries one.
func (c *seqClient) next(t *testing.T) seqLine {
	t.Helper()

	require.True(t, c.scanner.Scan(), "read a line from the daemon: %v", c.scanner.Err())

	var line seqLine

	require.NoError(t, json.Unmarshal(c.scanner.Bytes(), &line), "line %q", c.scanner.Text())

	if line.Seq != nil {
		c.lastSeq = *line.Seq
	}

	return line
}

// expect reads one line and checks its type, and its text when want has one.
func (c *seqClient) expect(t *testing.T, want seqLine) {
	t.Helper()

	got := c.next(t)
	assert.Equal(t, want.Type, got.Type, "line type")
	assert.Equal(t, want.Text, got.Text, "line text")
}

// replay reads a replay from its start to its end and returns the texts of
// the replayed lines with their seqs.
func (c *seqClient) replay(t *testing.T) []replayed {
	t.Helper()

	require.Equal(t, "transcript_replay_start", c.next(t).Type)

	var lines []replayed

	for {
		line := c.next(t)
		if line.Type == "transcript_replay_end" {
			return lines
		}

		require.NotNil(t, line.Seq, "replayed line %q has no seq", line.Text)
		lines = append(lines, replayed{text: line.Text, seq: *line.Seq})
	}
}

type replayed struct {
	text string
	seq  int64
}

// ledgerEvent is a worker event the pump writes to the ledger as one line.
func ledgerEvent(text string) WorkerEvent {
	return WorkerEvent{Type: "sdk_event", Payload: []byte(`{"type":"sdk_event","text":"` + text + `"}`)}
}

// waitForLedgerLines waits until the session's ledger holds n lines.
func waitForLedgerLines(t *testing.T, entry *SessionEntry, n int) {
	t.Helper()

	require.Eventually(t, func() bool {
		count := 0
		err := entry.Ledger.Replay(context.Background(), func([]byte) bool {
			count++

			return true
		})

		return err == nil && count == n
	}, 10*time.Second, 10*time.Millisecond, "ledger never held %d lines", n)
}

// TestAttachReconnectGetsExactlyTheMissedLedgerEvents pins what ?after=
// counts: a client that keeps the last seq it saw and reconnects with it
// gets the ledger events it missed, none twice and none skipped, whatever
// else it was sent. A mux session's frames and the replay's start and end
// lines are not ledger lines and do not count.
func TestAttachReconnectGetsExactlyTheMissedLedgerEvents(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	t.Parallel()

	tests := []struct {
		name string
		mux  bool
	}{
		{name: "agent session", mux: false},
		{name: "mux session", mux: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			f := startAttachFixture(t)

			var (
				worker *MockWorkerHandle
				muxer  *fakeRemoteMuxWorker
				entry  *SessionEntry
			)

			if tt.mux {
				muxer = newFakeRemoteMuxWorker("s-mux")
				worker = muxer.MockWorkerHandle
				entry = f.addWorkerSession(t, "s-mux", muxer)
			} else {
				worker = NewMockWorkerHandle("s-agent", nil)
				entry = f.addWorkerSession(t, "s-agent", worker)
			}

			sid := entry.SID

			// sendFrame sends a mux frame on the socket the attach joined
			// with, and checks that it arrives; an agent session has none.
			sendFrame := func(t *testing.T, client *seqClient, socket muxSocket) {
				t.Helper()

				if socket == nil {
					return
				}

				require.True(t, socket.send([]byte(`{"t":"exit","pane":"pane-1"}`)))
				client.expect(t, seqLine{Type: "mux"}) //nolint:exhaustruct
			}

			push := func(t *testing.T, client *seqClient, text string) {
				t.Helper()

				worker.Push(ledgerEvent(text))
				client.expect(t, seqLine{Type: "sdk_event", Text: text}) //nolint:exhaustruct
			}

			require.NoError(t, entry.Ledger.Append([]byte(`{"type":"sdk_event","text":"one"}`)))
			require.NoError(t, entry.Ledger.Append([]byte(`{"type":"sdk_event","text":"two"}`)))

			// First attach: the replay, then live events between mux frames.
			first := f.attachAfter(t, sid, 0)
			assert.Equal(t, []replayed{{text: "one", seq: 1}, {text: "two", seq: 2}}, first.replay(t))

			var socket muxSocket
			if tt.mux {
				socket = <-muxer.joined
			}

			sendFrame(t, first, socket)
			push(t, first, "three")
			sendFrame(t, first, socket)
			sendFrame(t, first, socket)
			push(t, first, "four")
			sendFrame(t, first, socket)

			require.NoError(t, first.sess.Close())
			f.waitForHandlerReturn(t)

			// Events the client misses while it is away.
			worker.Push(ledgerEvent("five"))
			worker.Push(ledgerEvent("six"))
			waitForLedgerLines(t, entry, 6)

			assert.Equal(t, int64(4), first.lastSeq, "the last seq the client saw counts the ledger lines it got")

			// Reconnect: exactly the missed events, then live events go on
			// from there.
			second := f.attachAfter(t, sid, first.lastSeq)
			assert.Equal(t, []replayed{{text: "five", seq: 5}, {text: "six", seq: 6}}, second.replay(t))

			if tt.mux {
				socket = <-muxer.joined
			}

			sendFrame(t, second, socket)
			push(t, second, "seven")
			assert.Equal(t, int64(7), second.lastSeq)

			require.NoError(t, second.sess.Close())
			f.waitForHandlerReturn(t)
		})
	}
}

// TestAttachAfterBeyondTheLedgerGoesBackToItsEnd pins that a client whose
// ?after= is past the end of the ledger, as after the ledger was replaced,
// gets no replay and then live events numbered as the ledger lines they are.
func TestAttachAfterBeyondTheLedgerGoesBackToItsEnd(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	t.Parallel()

	f := startAttachFixture(t)
	worker := NewMockWorkerHandle("s-short", nil)
	entry := f.addWorkerSession(t, "s-short", worker)

	require.NoError(t, entry.Ledger.Append([]byte(`{"type":"sdk_event","text":"one"}`)))
	require.NoError(t, entry.Ledger.Append([]byte(`{"type":"sdk_event","text":"two"}`)))

	client := f.attachAfter(t, "s-short", 10)
	assert.Empty(t, client.replay(t))
	assert.Equal(t, int64(2), client.lastSeq, "the replay's end carries the ledger's last line")

	worker.Push(ledgerEvent("three"))
	client.expect(t, seqLine{Type: "sdk_event", Text: "three"}) //nolint:exhaustruct
	assert.Equal(t, int64(3), client.lastSeq)

	require.NoError(t, client.sess.Close())
	f.waitForHandlerReturn(t)
}

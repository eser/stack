// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsserverfx

import (
	"bytes"
	"encoding/json"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/muxfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The bytes a remote client receives for a recorded Claude Code session:
// the pty-claude-100x30 case of the muxfx fidelity corpus (the trust prompt,
// the start screen, /help, its tabs and three resizes) played through the
// daemon's mux worker, its hub and the attach stream's line framing. Each
// corpus step is one PTY read; after each, a stepped clock moves past the
// synchronized-output hold, so every step brings at most one screen message
// per pane. Only the mux lines are counted, not the replay lines every
// attach starts with, nor QUIC's framing. The screens are compared with the
// raw output messages the daemon sent for the same session before the mux
// server emulated panes. Print the numbers with:
//
//	go test ./pkg/ajan/noskillsserverfx/ -run TestRemoteMuxBytesForTheClaudeCodeSession -v
//	go test ./pkg/ajan/noskillsserverfx/ -run '^$' -bench 'BenchmarkRemoteMux' -benchmem

// steppedClock is a [muxfx.Clock] that moves only when Advance is called;
// due timers fire on the advancing goroutine.
type steppedClock struct {
	mu     sync.Mutex
	now    time.Time
	timers []*steppedTimer
}

type steppedTimer struct {
	at   time.Time
	f    func()
	done bool
}

func newSteppedClock() *steppedClock {
	return &steppedClock{now: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)} //nolint:exhaustruct
}

func (c *steppedClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()

	return c.now
}

func (c *steppedClock) AfterFunc(d time.Duration, f func()) func() bool {
	c.mu.Lock()
	defer c.mu.Unlock()

	timer := &steppedTimer{at: c.now.Add(d), f: f} //nolint:exhaustruct
	c.timers = append(c.timers, timer)

	return func() bool {
		c.mu.Lock()
		defer c.mu.Unlock()

		stopped := !timer.done
		timer.done = true

		return stopped
	}
}

// Advance moves the clock by d and fires the timers that came due, in order.
func (c *steppedClock) Advance(d time.Duration) {
	c.mu.Lock()
	c.now = c.now.Add(d)

	var due []*steppedTimer

	for _, timer := range c.timers {
		if !timer.done && !timer.at.After(c.now) {
			timer.done = true
			due = append(due, timer)
		}
	}

	c.timers = slices.DeleteFunc(c.timers, func(timer *steppedTimer) bool { return timer.done })
	c.mu.Unlock()

	slices.SortFunc(due, func(a, b *steppedTimer) int { return a.at.Compare(b.at) })

	for _, timer := range due {
		timer.f()
	}
}

// remoteSession is what a remote client received for the played session.
type remoteSession struct {
	// frames are the encoded server frames, in order.
	frames [][]byte
	// wireBytes is the size of the mux lines that carried them.
	wireBytes int
	// screens counts the screen messages.
	screens int
	// pane is the session's one pane.
	pane muxfx.PaneID
	// painted holds, for each step before the first resize, the screen the
	// frames so far paint, in a screen session.
	painted []paintedScene
}

// viewportFor is the viewport that gives the daemon's one pane cols by rows
// cells: the default chrome takes a row each for the tab and status bars,
// and the pane's border one cell on every side.
func viewportFor(cols, rows int) string {
	viewport, _ := json.Marshal(muxfx.Viewport{Cols: cols + 2, Rows: rows + 4})

	return string(viewport)
}

// playClaudeSession plays the corpus case through a mux worker for an
// attached client and returns what the client received. With paint, it also
// paints the screens of the steps before the first resize.
func playClaudeSession(tb testing.TB, corpus *corpusCase, paint bool) remoteSession {
	tb.Helper()

	host := newFakePtyHost()
	clock := newSteppedClock()
	worker := newFakeHostMuxWorker(tb, host, clock)
	socket := &recordingSocket{} //nolint:exhaustruct

	worker.joinRemote(socket)
	sendMux(tb, worker, `{"t":"action","action":{"type":"newTab"}}`)
	sendMux(tb, worker, `{"t":"attach","viewport":`+viewportFor(corpus.Cols, corpus.Rows)+`}`)

	host.mu.Lock()
	require.Len(tb, host.order, 1, "spawned panes")
	pane := host.order[0]
	host.mu.Unlock()

	var (
		session = remoteSession{pane: pane} //nolint:exhaustruct
		painter = newScreenPainter()
		painted = 0
		resized = false
	)

	for i := range corpus.Steps {
		step := &corpus.Steps[i]

		if step.Resize != nil {
			resized = true

			sendMux(tb, worker, `{"t":"resize","viewport":`+viewportFor(step.Resize[0], step.Resize[1])+`}`)
		} else {
			host.output(pane, string(stepBytes(tb, step)))
		}

		// Past the frame interval and the synchronized-output hold, twice,
		// so a frame held by either goes out.
		clock.Advance(muxfx.SynchronizedOutputHold)
		clock.Advance(muxfx.SynchronizedOutputHold)

		if resized || !paint {
			continue
		}

		frames, _ := socket.state()
		for _, frame := range frames[painted:] {
			var msg muxfx.ServerToFrontend

			require.NoError(tb, json.Unmarshal([]byte(frame), &msg))

			if msg.T == muxfx.MessageScreen && msg.Pane == pane {
				painter.apply(msg.Screen)
			}
		}

		painted = len(frames)
		session.painted = append(session.painted, painter.scene())
	}

	frames, closed := socket.state()
	require.False(tb, closed, "the client was dropped")

	var line []byte

	for i, frame := range frames {
		line = appendMuxLine(line[:0], int64(i+1), []byte(frame))
		session.wireBytes += len(line)
		session.frames = append(session.frames, []byte(frame))

		if bytes.HasPrefix([]byte(frame), []byte(`{"t":"screen"`)) {
			session.screens++
		}
	}

	return session
}

// legacyMuxLine is the line the daemon sent for a mux frame before the
// remote path had sockets of its own: the worker wrapped the frame for the
// session pump, the attach decoded the wrapper into a map and encoded it
// again with v and seq.
func legacyMuxLine(tb testing.TB, seq int64, frame []byte) []byte {
	tb.Helper()

	wrapped, err := json.Marshal(struct {
		Type  string          `json:"type"`
		V     int             `json:"v"`
		Frame json.RawMessage `json:"frame"`
	}{Type: "mux", V: 1, Frame: frame})
	require.NoError(tb, err)

	var raw map[string]any

	require.NoError(tb, json.Unmarshal(wrapped, &raw))

	raw["v"] = 1
	raw["seq"] = seq

	var out bytes.Buffer

	require.NoError(tb, json.NewEncoder(&out).Encode(raw))

	return out.Bytes()
}

// remoteOutputBytes is what the daemon sent for the session on output
// messages, measured before the output path was removed (TASK-338);
// outputWireBytes rebuilds it.
const remoteOutputBytes = 33793

// outputWireBytes is the size and count of the lines the daemon sent for
// the session before the mux server emulated panes and before this path had
// sockets of its own: the session's scene frames and an output message with
// each PTY read, each line encoded as legacyMuxLine does. A line's size
// depends on its sequence number, not on the frame before it, so the order
// of the frames does not change the sum.
func outputWireBytes(tb testing.TB, corpus *corpusCase, session *remoteSession) (int, int) {
	tb.Helper()

	var frames [][]byte

	for _, frame := range session.frames {
		if bytes.HasPrefix(frame, []byte(`{"t":"scene"`)) {
			frames = append(frames, frame)
		}
	}

	for i := range corpus.Steps {
		if corpus.Steps[i].Resize != nil {
			continue
		}

		output, err := json.Marshal(struct {
			T    string       `json:"t"`
			Pane muxfx.PaneID `json:"pane"`
			Data string       `json:"data"`
		}{T: "output", Pane: session.pane, Data: string(stepBytes(tb, &corpus.Steps[i]))})
		require.NoError(tb, err)

		frames = append(frames, output)
	}

	total := 0

	for i, frame := range frames {
		total += len(legacyMuxLine(tb, int64(i+1), frame))
	}

	return total, len(frames)
}

// remoteScreenBytesBudget bounds the bytes of the screen session against the
// output session before the mux server emulated panes. Measured with Go
// 1.26: 1.07 (36233 bytes), and 2.12 (71645 bytes) before runs and lines
// went on the wire as arrays. Screens carry every changed row, while the
// program's output often moves the cursor and rewrites a few cells; the
// screens win on bursts faster than a frame interval and on slow clients,
// which skip to the latest screen.
const remoteScreenBytesBudget = 1.2

// TestRemoteMuxBytesForTheClaudeCodeSession measures the bytes a remote
// client gets for the recorded Claude Code session on screen messages,
// checks that the screens paint what the corpus recorded, and fails when
// they cost more than remoteScreenBytesBudget times the output messages the
// daemon sent before.
func TestRemoteMuxBytesForTheClaudeCodeSession(t *testing.T) {
	t.Parallel()

	_, corpus := loadClaudeCorpusCase(t)

	screen := playClaudeSession(t, &corpus, true)

	for i, got := range screen.painted {
		require.NotNil(t, corpus.Steps[i].Expect)
		assert.Equal(t, corpusExpectation(corpus.Steps[i].Expect), got, "step %d of %s", i, corpus.Name)
	}

	output, outputLines := outputWireBytes(t, &corpus, &screen)
	require.Equal(t, remoteOutputBytes, output, "the output messages as the daemon sent them")

	ptyBytes := 0

	for i := range corpus.Steps {
		ptyBytes += len(stepBytes(t, &corpus.Steps[i]))
	}

	t.Logf("%s: %d bytes of PTY output in %d steps", corpus.Name, ptyBytes, len(corpus.Steps))
	t.Logf("output messages, as the daemon sent them before: %d bytes in %d lines", output, outputLines)
	t.Logf("screen messages, on the attach's mux socket:     %d bytes in %d lines (%d screens)",
		screen.wireBytes, len(screen.frames), screen.screens)
	t.Logf("screen / output before: %.2f", float64(screen.wireBytes)/float64(output))

	assert.LessOrEqual(t, float64(screen.wireBytes), remoteScreenBytesBudget*float64(output),
		"the screens cost more than %.1f times the output", remoteScreenBytesBudget)
}

// BenchmarkRemoteMuxClaudeCodeSession plays the recorded Claude Code
// session through the mux worker for an attached client and reports the
// bytes sent on the attach stream per session (wire-B/op).
func BenchmarkRemoteMuxClaudeCodeSession(b *testing.B) {
	_, corpus := loadClaudeCorpusCase(b)

	wire := 0

	for b.Loop() {
		wire = playClaudeSession(b, &corpus, false).wireBytes
	}

	b.ReportMetric(float64(wire), "wire-B/op")
}

// BenchmarkRemoteMuxEncoding encodes the screen messages of the recorded
// Claude Code session into attach lines, three ways: as the daemon did
// before (the pump's wrapper, decoded into a map and encoded again), with
// json.Marshal, which compacts what ServerToFrontend.MarshalJSON returns,
// and with MarshalJSON called directly, as the hub does.
func BenchmarkRemoteMuxEncoding(b *testing.B) {
	_, corpus := loadClaudeCorpusCase(b)

	session := playClaudeSession(b, &corpus, false)

	var messages []muxfx.ServerToFrontend

	size := 0

	for _, frame := range session.frames {
		var msg muxfx.ServerToFrontend

		require.NoError(b, json.Unmarshal(frame, &msg))

		if msg.T == muxfx.MessageScreen {
			messages = append(messages, msg)
			size += len(frame)
		}
	}

	encoders := []struct {
		name   string
		encode func(msg *muxfx.ServerToFrontend) ([]byte, error)
	}{
		{"json.Marshal", func(msg *muxfx.ServerToFrontend) ([]byte, error) { return json.Marshal(msg) }},
		{"MarshalJSON", encodeMuxFrame},
	}

	b.Run("before", func(b *testing.B) {
		b.SetBytes(int64(size))

		for b.Loop() {
			for i := range messages {
				frame, err := json.Marshal(&messages[i])
				if err != nil {
					b.Fatal(err)
				}

				legacyMuxLine(b, int64(i+1), frame)
			}
		}
	})

	for _, encoder := range encoders {
		b.Run(encoder.name, func(b *testing.B) {
			b.SetBytes(int64(size))

			var line []byte

			for b.Loop() {
				for i := range messages {
					frame, err := encoder.encode(&messages[i])
					if err != nil {
						b.Fatal(err)
					}

					line = appendMuxLine(line[:0], int64(i+1), frame)
				}
			}
		})
	}
}

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsserverfx

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/eser/stack/pkg/ajan/muxfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The remote mux path: the clients of a daemon mux session join the mux
// worker's hub, each with a queuedSocket that forwardEvents writes to its
// WebTransport stream. These tests run the worker on a fake pane host.

// remoteLine is a line the daemon sends on an attach stream.
type remoteLine struct {
	Type  string                  `json:"type"`
	V     int                     `json:"v"`
	Seq   int64                   `json:"seq"`
	Frame *muxfx.ServerToFrontend `json:"frame"`
}

// newFakeHostMuxWorker starts a mux worker whose panes run on host, paced
// by clock (nil means the time package).
func newFakeHostMuxWorker(tb testing.TB, host *fakePtyHost, clock muxfx.Clock) *muxWorker {
	tb.Helper()

	worker, err := startMuxWorker(tb.Context(), "s-remote", tb.TempDir(), logfx.NewLogger(logfx.WithWriter(io.Discard)),
		muxWorkerOptions{
			newHost: func(callbacks muxfx.PtyHostCallbacks) muxfx.PtyHost { return host.connect(callbacks) },
			clock:   clock,
		})
	require.NoError(tb, err)

	tb.Cleanup(func() {
		_ = worker.Close() // the test is over; a second close is fine
	})

	return worker
}

// sendMux passes a client frame to the worker as an attach's reader does.
func sendMux(tb testing.TB, worker *muxWorker, frame string) {
	tb.Helper()

	require.NoError(tb, worker.SendMux(tb.Context(), json.RawMessage(frame)))
}

// TestMuxHubJoinedSocketsShareTheFrames pins that a socket joining a daemon
// session's hub leaves the others attached, and that each waits for a full
// scene of its own before it gets deltas and screens.
func TestMuxHubJoinedSocketsShareTheFrames(t *testing.T) {
	t.Parallel()

	hub := newMuxHub()
	first := &recordingSocket{}  //nolint:exhaustruct
	second := &recordingSocket{} //nolint:exhaustruct

	screen := muxfx.ServerToFrontend{T: muxfx.MessageScreen, Pane: "pane-1", Screen: &muxfx.ScreenUpdate{}} //nolint:exhaustruct

	hub.join(first)
	hub.Send(muxfx.ServerToFrontend{T: muxfx.MessageScene, Full: true, Delta: &muxfx.SceneDelta{}}) //nolint:exhaustruct
	hub.Send(screen)

	hub.join(second)
	hub.Send(screen)
	hub.Send(muxfx.ServerToFrontend{T: muxfx.MessageScene, Full: true, Delta: &muxfx.SceneDelta{}}) //nolint:exhaustruct
	hub.Send(screen)

	firstFrames, firstClosed := first.state()
	secondFrames, secondClosed := second.state()

	assert.False(t, firstClosed, "joining closed the first socket")
	assert.False(t, secondClosed)
	assert.Len(t, firstFrames, 5)
	require.Len(t, secondFrames, 2, "the screen before the second socket's full scene is held back")
	assert.Contains(t, secondFrames[0], `"t":"scene"`)
	assert.Contains(t, secondFrames[1], `"t":"screen"`)
}

// TestMuxHubWaitsForTheSlowestSocketAndNotForOneThatLeft pins the flow
// control with several sockets: the hub is full while any socket is, and
// a full socket that leaves calls the server back at once, so it does not
// hold back the others.
func TestMuxHubWaitsForTheSlowestSocketAndNotForOneThatLeft(t *testing.T) {
	t.Parallel()

	hub := newMuxHub()
	fast := &recordingSocket{}           //nolint:exhaustruct
	slow := &recordingSocket{hold: true} //nolint:exhaustruct

	calls := 0

	hub.OnWritable(func() { calls++ })
	hub.join(fast)
	hub.join(slow)

	for range muxScreenWindow {
		hub.Send(muxfx.ServerToFrontend{T: muxfx.MessageExit}) //nolint:exhaustruct
	}

	assert.False(t, hub.Writable(), "the slow socket is full")
	assert.Zero(t, calls)

	hub.detach(slow)
	assert.Equal(t, 1, calls, "the server is called back once the full socket left")
	assert.True(t, hub.Writable())
}

// TestRemoteMuxSemanticInputReachesThePane pins that key, paste, mouse and
// focus messages from a remote client pass the sanitizer and reach the pane
// as the bytes its modes call for.
func TestRemoteMuxSemanticInputReachesThePane(t *testing.T) {
	t.Parallel()

	host := newFakePtyHost()
	worker := newFakeHostMuxWorker(t, host, nil)

	sendMux(t, worker, `{"t":"action","action":{"type":"newTab"}}`)
	sendMux(t, worker, `{"t":"attach","viewport":{"cols":80,"rows":24}}`)

	pane := host.onlyPane(t)

	// The program turns on SGR mouse reports, focus reports and bracketed
	// paste.
	host.output(pane, "\x1b[?1000h\x1b[?1006h\x1b[?1004h\x1b[?2004h")

	sendMux(t, worker, `{"t":"key","key":{"key":"a","code":"KeyA","text":"a"}}`)
	sendMux(t, worker, `{"t":"key","pane":"`+string(pane)+`","key":{"key":"Enter","code":"Enter"}}`)
	sendMux(t, worker, `{"t":"paste","paste":{"text":"hi"}}`)
	sendMux(t, worker, `{"t":"mouse","mouse":{"kind":"press","button":"left","row":2,"col":4}}`)
	sendMux(t, worker, `{"t":"focus","focus":{"focused":true}}`)

	assert.Equal(t, []string{"a", "\r", "\x1b[200~hi\x1b[201~", "\x1b[<0;5;3M", "\x1b[I"}, host.written())
}

// TestRemoteMuxClampsAnOversizeViewport pins that a remote client cannot
// make the panes allocate a screen of any size it names: the viewport of an
// attach, a resize and a resizeViewport action are clamped.
func TestRemoteMuxClampsAnOversizeViewport(t *testing.T) {
	t.Parallel()

	host := newFakePtyHost()
	worker := newFakeHostMuxWorker(t, host, nil)
	limit := muxfx.Viewport{Cols: muxfx.MaxRemoteViewportCols, Rows: muxfx.MaxRemoteViewportRows}

	sendMux(t, worker, `{"t":"action","action":{"type":"newTab"}}`)

	frames := []string{
		`{"t":"attach","viewport":{"cols":100000,"rows":100000}}`,
		`{"t":"resize","viewport":{"cols":70000,"rows":90000}}`,
		`{"t":"action","action":{"type":"resizeViewport","cols":1000000,"rows":3000}}`,
	}

	for _, frame := range frames {
		sendMux(t, worker, `{"t":"resize","viewport":{"cols":80,"rows":24}}`)
		require.Equal(t, muxfx.Viewport{Cols: 80, Rows: 24}, worker.server.State().Viewport)

		sendMux(t, worker, frame)
		assert.Equal(t, limit, worker.server.State().Viewport, "after %s", frame)
	}
}

// TestForwardEventsEndsWhenTheMuxSocketFellBehind pins that a client whose
// mux socket was dropped for a full queue loses its attach, so it reattaches
// and gets a full scene, while a socket closed with its session does not end
// the attach: the session's events do.
func TestForwardEventsEndsWhenTheMuxSocketFellBehind(t *testing.T) {
	t.Parallel()

	logger := logfx.NewLogger(logfx.WithWriter(io.Discard))

	behind := newQueuedSocket()
	frame := []byte(`{"t":"exit","code":0}`)

	for range muxSocketQueue {
		require.True(t, behind.send(frame))
	}

	require.False(t, behind.send(frame), "a frame past the queue")
	behind.close()

	var seq int64

	err := forwardEvents(t.Context(), io.Discard, &seq, replayCut{}, make(chan WorkerEvent), behind, logger)
	require.ErrorIs(t, err, errMuxClientBehind)

	closed := newQueuedSocket()
	closed.close()

	events := make(chan WorkerEvent)
	result := make(chan error, 1)

	go func() { result <- forwardEvents(t.Context(), io.Discard, &seq, replayCut{}, events, closed, logger) }()

	close(events)
	require.NoError(t, <-result)
}

// pipeReader collects the lines a client reads from the far end of an
// attach stream, once started.
type pipeReader struct {
	mu    sync.Mutex
	lines []remoteLine
	done  chan struct{}
}

func readPipe(t *testing.T, conn net.Conn) *pipeReader {
	t.Helper()

	reader := &pipeReader{done: make(chan struct{})} //nolint:exhaustruct

	go func() {
		defer close(reader.done)

		scanner := bufio.NewScanner(conn)
		scanner.Buffer(make([]byte, 0, 64*1024), 1<<22)

		for scanner.Scan() {
			var line remoteLine
			if err := json.Unmarshal(scanner.Bytes(), &line); err != nil {
				t.Errorf("the client read a line that is not JSON: %q", scanner.Text())

				return
			}

			reader.mu.Lock()
			reader.lines = append(reader.lines, line)
			reader.mu.Unlock()
		}
	}()

	return reader
}

// painted paints the screens of pane among the lines read so far, and
// counts them.
func (r *pipeReader) painted(pane muxfx.PaneID) (*screenPainter, int) {
	r.mu.Lock()
	defer r.mu.Unlock()

	painter := newScreenPainter()
	screens := 0

	for _, line := range r.lines {
		if line.Frame != nil && line.Frame.T == muxfx.MessageScreen && line.Frame.Pane == pane {
			painter.apply(line.Frame.Screen)
			screens++
		}
	}

	return painter, screens
}

// TestARemoteClientThatStopsReadingGetsTheLatestScreen writes pane output a
// frame interval apart to a remote client whose stream takes nothing. The
// frames queued for it stay within the hub's window, it is not dropped, and
// once it reads again the screens it gets paint the pane as it is now, with
// fewer screens than the output had lines.
func TestARemoteClientThatStopsReadingGetsTheLatestScreen(t *testing.T) {
	t.Parallel()

	host := newFakePtyHost()
	worker := newFakeHostMuxWorker(t, host, nil)
	logger := logfx.NewLogger(logfx.WithWriter(io.Discard))

	daemonEnd, clientEnd := net.Pipe()
	t.Cleanup(func() {
		_ = clientEnd.Close() // a pipe end; nothing to report
	})

	socket := newQueuedSocket()
	worker.joinRemote(socket)

	events := make(chan WorkerEvent)
	forwarded := make(chan error, 1)

	go func() {
		var seq int64

		forwarded <- forwardEvents(t.Context(), boundedWriter{stream: daemonEnd, timeout: attachWriteTimeout},
			&seq, replayCut{}, events, socket, logger)
	}()

	sendMux(t, worker, `{"t":"action","action":{"type":"newTab"}}`)
	sendMux(t, worker, `{"t":"attach","viewport":{"cols":42,"rows":14}}`)

	pane := host.onlyPane(t)

	lines := 3 * muxScreenWindow
	for i := range lines {
		host.output(pane, fmt.Sprintf("line %d\r\n", i))
		// Past the frame interval, so each line could be a frame of its own.
		time.Sleep(2 * muxfx.ScreenFrameInterval)
	}

	// The forwarder holds one frame in its blocked write; the rest wait.
	assert.LessOrEqual(t, socket.backlog(), muxScreenWindow, "frames queued for a client that reads nothing")

	select {
	case <-socket.stopped():
		t.Fatal("the client was dropped")
	default:
	}

	reader := readPipe(t, clientEnd)
	last := fmt.Sprintf("line %d", lines-1)

	require.Eventually(t, func() bool {
		painter, _ := reader.painted(pane)

		return strings.Contains(painter.text(), last)
	}, muxWait, 5*time.Millisecond, "the client did not get the latest screen after it read again")

	_, screens := reader.painted(pane)
	assert.Less(t, screens, lines, "the client got a screen per line instead of the latest one")

	worker.leaveRemote(socket)
	socket.close()
	close(events)
	require.NoError(t, <-forwarded)
	require.NoError(t, daemonEnd.Close())
	<-reader.done
}

// TestAttachTakesALargePaste pins that a mux client's paste of a large text
// reaches the pane over WebTransport. The attach read client lines with
// bufio.Scanner's default limit of 64 KiB, so a longer line ended the attach
// and the paste was lost; the limit is now the /mux socket's 1 MiB.
func TestAttachTakesALargePaste(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	t.Parallel()

	f := startAttachFixture(t)
	host := newFakePtyHost()
	worker := newFakeHostMuxWorker(t, host, nil)
	entry := f.addWorkerSession(t, "s-paste", worker)

	sess, err := f.client.ConnectWithHeaders(t.Context(), f.baseURL+entry.SID, f.headers)
	require.NoError(t, err, "attach")

	t.Cleanup(func() {
		_ = sess.Close() // the test is over either way
	})

	stream, err := sess.OpenBidiStreamSync(t.Context())
	require.NoError(t, err)

	sendMux(t, worker, `{"t":"action","action":{"type":"newTab"}}`)

	text := strings.Repeat("0123456789abcdef", 200*1024/16)
	frame, err := json.Marshal(map[string]any{
		"type":  "mux",
		"frame": map[string]any{"t": "paste", "paste": map[string]string{"text": text}},
	})
	require.NoError(t, err)

	_, err = stream.Write(append(frame, '\n'))
	require.NoError(t, err)

	require.Eventually(t, func() bool {
		return slices.Contains(host.written(), text)
	}, muxWait, 10*time.Millisecond, "the paste did not reach the pane")
}

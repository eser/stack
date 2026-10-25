// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsserverfx

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/muxfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// recordingSocket keeps the frames the hub queued for it. With hold set
// the frames stay in its backlog, as on a browser that reads slowly, until
// writeAll writes them.
type recordingSocket struct {
	mu      sync.Mutex
	frames  []string
	full    bool
	closed  bool
	hold    bool
	pending int
	drain   func()
}

func (s *recordingSocket) send(frame []byte) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.full {
		return false
	}

	s.frames = append(s.frames, string(frame))

	if s.hold {
		s.pending++
	}

	return true
}

func (s *recordingSocket) backlog() int {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.pending
}

func (s *recordingSocket) onDrain(fn func()) {
	s.mu.Lock()
	s.drain = fn
	s.mu.Unlock()
}

// writeAll writes the backlog one frame at a time, calling the drain
// function after each as the writer of a queuedSocket does.
func (s *recordingSocket) writeAll() {
	for {
		s.mu.Lock()
		if s.pending == 0 {
			s.mu.Unlock()

			return
		}

		s.pending--
		drain := s.drain
		s.mu.Unlock()

		if drain != nil {
			drain()
		}
	}
}

func (s *recordingSocket) close() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.closed = true
}

func (s *recordingSocket) state() ([]string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	return append([]string(nil), s.frames...), s.closed
}

func TestMuxHubForwardsToTheAttachedSocketOnly(t *testing.T) {
	t.Parallel()

	hub := newMuxHub()
	first := &recordingSocket{}  //nolint:exhaustruct
	second := &recordingSocket{} //nolint:exhaustruct

	hub.Send(muxfx.ServerToFrontend{T: muxfx.MessageScene, Full: true, Delta: &muxfx.SceneDelta{}}) //nolint:exhaustruct

	hub.attach(first)

	// A delta or a screen before the first full scene has no base on the
	// new socket.
	hub.Send(muxfx.ServerToFrontend{T: muxfx.MessageScene, Full: false, Delta: &muxfx.SceneDelta{}})        //nolint:exhaustruct
	hub.Send(muxfx.ServerToFrontend{T: muxfx.MessageScreen, Pane: "pane-1", Screen: &muxfx.ScreenUpdate{}}) //nolint:exhaustruct
	hub.Send(muxfx.ServerToFrontend{T: muxfx.MessageScene, Full: true, Delta: &muxfx.SceneDelta{}})         //nolint:exhaustruct
	hub.Send(muxfx.ServerToFrontend{T: muxfx.MessageScene, Full: false, Delta: &muxfx.SceneDelta{}})        //nolint:exhaustruct
	hub.Send(muxfx.ServerToFrontend{T: muxfx.MessageScreen, Pane: "pane-1", Screen: &muxfx.ScreenUpdate{}}) //nolint:exhaustruct

	frames, closed := first.state()
	require.Len(t, frames, 3)
	assert.Contains(t, frames[0], `"full":true`)
	assert.Contains(t, frames[1], `"full":false`)
	assert.Contains(t, frames[2], `"t":"screen"`)
	assert.False(t, closed)

	// A second socket takes over and the first is closed.
	hub.attach(second)

	_, closed = first.state()
	assert.True(t, closed)

	hub.detach(first)
	hub.Send(muxfx.ServerToFrontend{T: muxfx.MessageScene, Full: true, Delta: &muxfx.SceneDelta{}}) //nolint:exhaustruct

	frames, _ = second.state()
	assert.Len(t, frames, 1)
}

func TestMuxHubDropsASocketThatFallsBehind(t *testing.T) {
	t.Parallel()

	hub := newMuxHub()
	slow := &recordingSocket{full: true} //nolint:exhaustruct

	hub.attach(slow)
	hub.Send(muxfx.ServerToFrontend{T: muxfx.MessageScene, Full: true, Delta: &muxfx.SceneDelta{}}) //nolint:exhaustruct

	_, closed := slow.state()
	assert.True(t, closed)

	hub.mu.Lock()
	attached := len(hub.sockets)
	hub.mu.Unlock()
	assert.Zero(t, attached)
}

func TestMuxHubRefusesSocketsOnceClosed(t *testing.T) {
	t.Parallel()

	hub := newMuxHub()
	attached := &recordingSocket{} //nolint:exhaustruct
	late := &recordingSocket{}     //nolint:exhaustruct

	hub.attach(attached)
	hub.Close()
	hub.attach(late)

	_, attachedClosed := attached.state()
	_, lateClosed := late.state()

	assert.True(t, attachedClosed)
	assert.True(t, lateClosed)
}

func TestMuxHubSanitizesWhatSocketsSend(t *testing.T) {
	t.Parallel()

	hub := newMuxHub()

	var got muxfx.FrontendToServer

	hub.transport.OnMessage(func(msg muxfx.FrontendToServer) { got = msg })
	hub.deliver(&muxfx.FrontendToServer{T: muxfx.MessageAction, Action: &muxfx.Action{ //nolint:exhaustruct
		Type: muxfx.ActionNewTab, Command: "/bin/rm", Args: []string{"-rf", "/"}, Cwd: "/",
	}})

	require.NotNil(t, got.Action)
	assert.Empty(t, got.Action.Command)
	assert.Empty(t, got.Action.Args)
	assert.Empty(t, got.Action.Cwd)
}

func TestMuxHubPassesUserInputFramesIntact(t *testing.T) {
	t.Parallel()

	frames := []string{
		`{"t":"key","pane":"pane-1","key":{"key":"ArrowUp","code":"ArrowUp","ctrl":true}}`,
		`{"t":"paste","paste":{"text":"echo hi\n"}}`,
		`{"t":"mouse","mouse":{"kind":"press","button":"left","row":2,"col":4,"shift":true}}`,
		`{"t":"focus","focus":{"focused":true}}`,
	}

	for _, frame := range frames {
		hub := newMuxHub()

		var got muxfx.FrontendToServer

		hub.transport.OnMessage(func(msg muxfx.FrontendToServer) { got = msg })

		// readLoop decodes a text frame into a protocol message this way.
		var msg muxfx.FrontendToServer

		require.NoError(t, json.Unmarshal([]byte(frame), &msg))
		hub.deliver(&msg)

		out, err := json.Marshal(got)
		require.NoError(t, err)
		assert.JSONEq(t, frame, string(out))
	}
}

func TestMuxHubHoldsBackScreensUntilTheFullScene(t *testing.T) {
	t.Parallel()

	hub := newMuxHub()
	socket := &recordingSocket{} //nolint:exhaustruct

	hub.attach(socket)

	screen := muxfx.ServerToFrontend{T: muxfx.MessageScreen, Pane: "pane-1", Screen: &muxfx.ScreenUpdate{}} //nolint:exhaustruct

	// A patch the server sent its previous frontend has no base here.
	hub.Send(screen)
	hub.Send(muxfx.ServerToFrontend{T: muxfx.MessageScene, Full: true, Delta: &muxfx.SceneDelta{}}) //nolint:exhaustruct
	hub.Send(screen)

	frames, _ := socket.state()
	require.Len(t, frames, 2)
	assert.Contains(t, frames[0], `"t":"scene"`)
	assert.Contains(t, frames[1], `"t":"screen"`)
}

func TestMuxHubReportsAFullSocketAndCallsBackOnceItDrains(t *testing.T) {
	t.Parallel()

	hub := newMuxHub()
	socket := &recordingSocket{hold: true} //nolint:exhaustruct

	flow, ok := hub.transport.(muxfx.FlowControl)
	require.True(t, ok, "the sanitized hub keeps the flow control")

	calls := 0

	flow.OnWritable(func() { calls++ })
	assert.True(t, flow.Writable(), "with no socket the hub takes everything")

	hub.attach(socket)

	for range muxScreenWindow - 1 {
		hub.Send(muxfx.ServerToFrontend{T: muxfx.MessageExit}) //nolint:exhaustruct
	}

	assert.True(t, flow.Writable())

	// Draining while the server was not refused calls nothing.
	socket.writeAll()
	assert.Zero(t, calls)

	for range muxScreenWindow {
		hub.Send(muxfx.ServerToFrontend{T: muxfx.MessageExit}) //nolint:exhaustruct
	}

	assert.False(t, flow.Writable())

	socket.writeAll()
	assert.Equal(t, 1, calls, "the server is called back once the socket has room")
	assert.True(t, flow.Writable())
}

// TestASlowBrowserGetsTheLatestScreenInsteadOfAQueue writes pane output a
// frame interval apart while the browser reads nothing. Without flow control
// every line would queue a screen message until the socket's queue filled
// and the socket was dropped; with it the server stops at the hub's window,
// and once the socket drains the browser gets the screen as it is now.
func TestASlowBrowserGetsTheLatestScreenInsteadOfAQueue(t *testing.T) {
	t.Parallel()

	f := newDashboardFixture(t)

	_, err := f.d.mux.createTab(t.Context(), nil)
	require.NoError(t, err)

	pane := f.host.onlyPane(t)
	socket := &recordingSocket{hold: true} //nolint:exhaustruct

	f.d.mux.attachSocket(socket)
	f.d.mux.deliver(&muxfx.FrontendToServer{ //nolint:exhaustruct
		T: muxfx.MessageAttach, Viewport: &muxfx.Viewport{Cols: 42, Rows: 12},
	})

	lines := 3 * muxScreenWindow
	for i := range lines {
		f.host.output(pane, fmt.Sprintf("line %d\r\n", i))
		// Past the frame interval, so each line could be a frame of its own.
		time.Sleep(2 * muxfx.ScreenFrameInterval)
	}

	frames, closed := socket.state()
	assert.False(t, closed, "the slow socket was dropped")
	assert.LessOrEqual(t, countScreens(frames), muxScreenWindow, "screens queued for a socket that reads nothing")

	socket.writeAll()

	last := fmt.Sprintf("line %d", lines-1)

	require.Eventually(t, func() bool {
		frames, _ := socket.state()

		return strings.Contains(frames[len(frames)-1], last)
	}, muxWait, 5*time.Millisecond, "the browser did not get the latest screen after it drained")
}

// countScreens counts the screen messages among frames.
func countScreens(frames []string) int {
	n := 0

	for _, frame := range frames {
		if strings.Contains(frame, `"t":"screen"`) {
			n++
		}
	}

	return n
}

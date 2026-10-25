// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx_test

import (
	"context"
	"errors"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/muxfx"
)

// fakeHost records calls and lets a test drive output and exits.
type fakeHost struct {
	mu       sync.Mutex
	cb       muxfx.PtyHostCallbacks
	spawned  []muxfx.PaneID
	killed   []muxfx.PaneID
	writes   [][2]string
	spawnErr error
}

func (h *fakeHost) factory(cb muxfx.PtyHostCallbacks) muxfx.PtyHost {
	h.cb = cb

	return h
}

func (h *fakeHost) Spawn(req *muxfx.SpawnRequest) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.spawnErr != nil {
		return h.spawnErr
	}

	h.spawned = append(h.spawned, req.Pane)

	return nil
}

func (h *fakeHost) Write(pane muxfx.PaneID, data []byte) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.writes = append(h.writes, [2]string{string(pane), string(data)})

	return nil
}

func (h *fakeHost) Resize(muxfx.PaneID, int, int) error { return nil }

func (h *fakeHost) Kill(pane muxfx.PaneID) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.killed = append(h.killed, pane)
}

func (h *fakeHost) Forget(muxfx.PaneID) {}

func (h *fakeHost) KillAll() {}

func (h *fakeHost) Has(pane muxfx.PaneID) bool {
	h.mu.Lock()
	defer h.mu.Unlock()

	return slices.Contains(h.spawned, pane) && !slices.Contains(h.killed, pane)
}

type recorder struct {
	mu   sync.Mutex
	msgs []muxfx.ServerToFrontend
}

func (r *recorder) add(msg muxfx.ServerToFrontend) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.msgs = append(r.msgs, msg)
}

func (r *recorder) take() []muxfx.ServerToFrontend {
	r.mu.Lock()
	defer r.mu.Unlock()

	out := r.msgs
	r.msgs = nil

	return out
}

type setup struct {
	host     *fakeHost
	server   *muxfx.Server
	frontend muxfx.Transport[muxfx.FrontendToServer, muxfx.ServerToFrontend]
	server2  muxfx.Transport[muxfx.ServerToFrontend, muxfx.FrontendToServer]
	received *recorder
}

func newSetup(t *testing.T, mutate func(*muxfx.ServerOptions)) *setup {
	t.Helper()

	host := &fakeHost{}
	opts := &muxfx.ServerOptions{
		InitialState: muxfx.NewInitialState(muxfx.Viewport{Cols: 80, Rows: 24}),
		ResolveSpawn: func(*muxfx.Pane, muxfx.Geom) muxfx.SpawnSpec { return muxfx.SpawnSpec{Command: "sh"} },
		NewHost:      host.factory,
	}

	if mutate != nil {
		mutate(opts)
	}

	server := muxfx.NewServer(opts)
	serverSide, frontendSide := muxfx.NewInProcessPair[muxfx.ServerToFrontend, muxfx.FrontendToServer]()

	rec := &recorder{}
	frontendSide.OnMessage(rec.add)
	server.Connect(serverSide)

	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := server.Dispose(ctx); err != nil {
			t.Errorf("dispose: %v", err)
		}
	})

	return &setup{host: host, server: server, frontend: frontendSide, server2: serverSide, received: rec}
}

// screensText is the text of every row the screen messages carry, a line
// each.
func screensText(screens []muxfx.ServerToFrontend) string {
	var text strings.Builder

	for _, m := range screens {
		for _, line := range m.Screen.Lines {
			text.WriteString(runsText(line.Runs) + "\n")
		}
	}

	return text.String()
}

func findMessage(msgs []muxfx.ServerToFrontend, typ muxfx.MessageType) (muxfx.ServerToFrontend, bool) {
	for _, m := range msgs {
		if m.T == typ {
			return m, true
		}
	}

	return muxfx.ServerToFrontend{}, false
}

func TestServerSessions(t *testing.T) {
	t.Parallel()

	t.Run("attach pushes a full scene", func(t *testing.T) {
		t.Parallel()

		s := newSetup(t, nil)
		s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})
		s.received.take()

		s.frontend.Send(muxfx.FrontendToServer{T: muxfx.MessageAttach, Viewport: &muxfx.Viewport{Cols: 100, Rows: 30}})

		scene, ok := findMessage(s.received.take(), muxfx.MessageScene)
		if !ok || !scene.Full || *scene.Delta.Viewport != (muxfx.Viewport{Cols: 100, Rows: 30}) {
			t.Errorf("scene = %+v", scene)
		}
	})

	t.Run("newTab spawns a pane and broadcasts it", func(t *testing.T) {
		t.Parallel()

		s := newSetup(t, nil)
		s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})

		scene, ok := findMessage(s.received.take(), muxfx.MessageScene)
		if len(s.host.spawned) != 1 || !ok || len(scene.Delta.Panes) != 1 {
			t.Errorf("spawned = %v, scene = %+v", s.host.spawned, scene)
		}
	})

	t.Run("pane output reaches the frontend as its screen", func(t *testing.T) {
		t.Parallel()

		s := newSetup(t, nil)
		s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})
		s.host.cb.OnData(s.host.spawned[0], []byte("hello"))

		if got := s.received.take(); len(screensOf(got)) != 0 {
			t.Errorf("before attach, received %+v, want no screens", got)
		}

		s.frontend.Send(muxfx.FrontendToServer{T: muxfx.MessageAttach, Viewport: &muxfx.Viewport{Cols: 80, Rows: 24}})

		screens := screensOf(s.received.take())
		if len(screens) != 1 || screens[0].Pane != s.host.spawned[0] || !strings.Contains(screensText(screens), "hello") {
			t.Errorf("screens = %+v, want one with hello", screens)
		}
	})

	t.Run("input reaches the focused or the named pane", func(t *testing.T) {
		t.Parallel()

		s := newSetup(t, nil)
		s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})
		s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionSplitPane, Direction: string(muxfx.SplitVertical)})

		first, second := s.host.spawned[0], s.host.spawned[1]

		s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionWriteToPane, Pane: first, Data: "ping\r"})
		s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionWriteInput, Data: "x"})

		want := [][2]string{{string(first), "ping\r"}, {string(second), "x"}}
		if !slices.Equal(s.host.writes, want) {
			t.Errorf("writes = %v, want %v", s.host.writes, want)
		}
	})

	t.Run("closeFocusedPane kills the pane's process", func(t *testing.T) {
		t.Parallel()

		s := newSetup(t, nil)
		s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})
		s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionSplitPane, Direction: string(muxfx.SplitVertical)})
		s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionCloseFocusedPane})

		if !slices.Contains(s.host.killed, s.host.spawned[1]) {
			t.Errorf("killed = %v", s.host.killed)
		}
	})

	t.Run("setChrome rebroadcasts the scene", func(t *testing.T) {
		t.Parallel()

		s := newSetup(t, nil)
		s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})
		s.received.take()

		s.server.SetChrome(muxfx.Chrome{TabBarRows: 1, StatusBarRows: 1, LeftCols: 20})

		scene, ok := findMessage(s.received.take(), muxfx.MessageScene)
		if !ok || scene.Delta.Chrome == nil || scene.Delta.Chrome.LeftCols != 20 {
			t.Errorf("scene = %+v", scene)
		}
	})

	t.Run("scroll sends a sequence to the focused pane", func(t *testing.T) {
		t.Parallel()

		s := newSetup(t, nil)
		s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})
		s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionScroll, Scroll: muxfx.ScrollUp})

		if len(s.host.writes) != 1 || s.host.writes[0][0] != string(s.host.spawned[0]) {
			t.Errorf("writes = %v", s.host.writes)
		}
	})
}

func TestServerFailuresAndExits(t *testing.T) {
	t.Parallel()

	t.Run("a spawn failure is shown in the pane", func(t *testing.T) {
		t.Parallel()

		s := newSetup(t, nil)
		s.host.spawnErr = errors.New("command not found")
		s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})

		s.frontend.Send(muxfx.FrontendToServer{T: muxfx.MessageAttach, Viewport: &muxfx.Viewport{Cols: 80, Rows: 24}})

		text := screensText(screensOf(s.received.take()))
		if !strings.Contains(text, "failed to start") || !strings.Contains(text, "command not found") {
			t.Errorf("screen = %q", text)
		}
	})

	t.Run("onPaneExit runs when a pane exits on its own", func(t *testing.T) {
		t.Parallel()

		var exited []muxfx.PaneID

		s := newSetup(t, func(o *muxfx.ServerOptions) {
			o.KeepEmptySession = true
			o.OnPaneExit = func(p muxfx.PaneID) { exited = append(exited, p) }
		})
		s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})
		s.host.cb.OnExit(s.host.spawned[0], 0)

		if !slices.Equal(exited, s.host.spawned) {
			t.Errorf("exited = %v", exited)
		}
	})

	t.Run("disconnect stops delivery", func(t *testing.T) {
		t.Parallel()

		s := newSetup(t, nil)
		s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})
		s.server.Disconnect(s.server2)
		s.received.take()

		s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionSplitPane, Direction: string(muxfx.SplitVertical)})

		if got := s.received.take(); len(got) != 0 {
			t.Errorf("received after disconnect = %+v", got)
		}
	})

	t.Run("a kept empty session survives its last tab", func(t *testing.T) {
		t.Parallel()

		s := newSetup(t, func(o *muxfx.ServerOptions) { o.KeepEmptySession = true })
		s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})
		s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionCloseTab})

		if _, ok := findMessage(s.received.take(), muxfx.MessageExit); ok {
			t.Error("exit sent for a kept session")
		}

		if len(s.server.State().Tabs) != 0 {
			t.Errorf("tabs = %d, want 0", len(s.server.State().Tabs))
		}

		s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})

		if len(s.server.State().Tabs) != 1 {
			t.Errorf("tabs = %d, want 1", len(s.server.State().Tabs))
		}
	})

	t.Run("the last pane exiting ends the session without a kill", func(t *testing.T) {
		t.Parallel()

		s := newSetup(t, nil)
		s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})
		s.received.take()
		s.host.cb.OnExit(s.host.spawned[0], 0)

		if slices.Contains(s.host.killed, s.host.spawned[0]) {
			t.Error("an exited pane was killed")
		}

		if _, ok := findMessage(s.received.take(), muxfx.MessageExit); !ok {
			t.Error("no exit message")
		}
	})

	t.Run("a new connection replaces and closes the old one", func(t *testing.T) {
		t.Parallel()

		s := newSetup(t, nil)
		s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})

		otherServer, otherFrontend := muxfx.NewInProcessPair[muxfx.ServerToFrontend, muxfx.FrontendToServer]()
		rec := &recorder{}
		otherFrontend.OnMessage(rec.add)
		s.server.Connect(otherServer)
		s.received.take()

		otherFrontend.Send(muxfx.FrontendToServer{T: muxfx.MessageAttach, Viewport: &muxfx.Viewport{Cols: 80, Rows: 24}})

		if _, ok := findMessage(rec.take(), muxfx.MessageScene); !ok {
			t.Error("the new connection got no scene")
		}

		if got := s.received.take(); len(got) != 0 {
			t.Errorf("the old connection still receives: %+v", got)
		}
	})
}

// TestServerReentrantFrontend checks that a frontend answering a message by
// sending an action, on the same goroutine, does not deadlock the server.
func TestServerReentrantFrontend(t *testing.T) {
	t.Parallel()

	host := &fakeHost{}
	server := muxfx.NewServer(&muxfx.ServerOptions{
		InitialState: muxfx.NewInitialState(muxfx.Viewport{Cols: 80, Rows: 24}),
		ResolveSpawn: func(*muxfx.Pane, muxfx.Geom) muxfx.SpawnSpec { return muxfx.SpawnSpec{Command: "sh"} },
		NewHost:      host.factory,
	})
	serverSide, frontendSide := muxfx.NewInProcessPair[muxfx.ServerToFrontend, muxfx.FrontendToServer]()

	answered := false

	frontendSide.OnMessage(func(msg muxfx.ServerToFrontend) {
		if msg.T == muxfx.MessageScene && !answered {
			answered = true

			frontendSide.Send(muxfx.FrontendToServer{T: muxfx.MessageAction, Action: &muxfx.Action{Type: muxfx.ActionWriteInput, Data: "echo\r"}})
		}
	})
	server.Connect(serverSide)
	server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})

	if len(host.writes) != 1 {
		t.Errorf("writes = %v, want the answer applied", host.writes)
	}

	if err := server.Dispose(context.Background()); err != nil {
		t.Errorf("dispose: %v", err)
	}
}

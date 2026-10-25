// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx_test

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"runtime"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/muxfx"
	"github.com/eser/stack/pkg/ajan/muxfx/vt"
)

// fakeClock is a [muxfx.Clock] that moves only when a test advances it; due
// timers fire on the advancing goroutine.
type fakeClock struct {
	mu     sync.Mutex
	now    time.Time
	timers []*fakeTimer
}

type fakeTimer struct {
	at   time.Time
	f    func()
	done bool
}

func newFakeClock() *fakeClock {
	return &fakeClock{now: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)}
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()

	return c.now
}

func (c *fakeClock) AfterFunc(d time.Duration, f func()) func() bool {
	c.mu.Lock()
	defer c.mu.Unlock()

	timer := &fakeTimer{at: c.now.Add(d), f: f}
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
func (c *fakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	c.now = c.now.Add(d)

	var due []*fakeTimer

	for _, timer := range c.timers {
		if !timer.done && !timer.at.After(c.now) {
			timer.done = true
			due = append(due, timer)
		}
	}

	c.timers = slices.DeleteFunc(c.timers, func(timer *fakeTimer) bool { return timer.done })
	c.mu.Unlock()

	slices.SortFunc(due, func(a, b *fakeTimer) int { return a.at.Compare(b.at) })

	for _, timer := range due {
		timer.f()
	}
}

// flowTransport is a server-side transport with [muxfx.FlowControl] whose
// writability a test switches.
type flowTransport struct {
	muxfx.Transport[muxfx.ServerToFrontend, muxfx.FrontendToServer]

	mu         sync.Mutex
	writable   bool
	onWritable func()
	sent       int
}

func (f *flowTransport) Send(msg muxfx.ServerToFrontend) {
	f.mu.Lock()
	f.sent++
	f.mu.Unlock()

	f.Transport.Send(msg)
}

func (f *flowTransport) Writable() bool {
	f.mu.Lock()
	defer f.mu.Unlock()

	return f.writable
}

func (f *flowTransport) OnWritable(fn func()) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.onWritable = fn
}

func (f *flowTransport) setWritable(writable bool) {
	f.mu.Lock()
	f.writable = writable
	fn := f.onWritable
	f.mu.Unlock()

	if writable && fn != nil {
		fn()
	}
}

// wireRecorder keeps the messages a frontend receives after a trip through
// their JSON encoding, as a remote frontend reads them.
type wireRecorder struct {
	t    *testing.T
	mu   sync.Mutex
	msgs []muxfx.ServerToFrontend
}

func (r *wireRecorder) add(msg muxfx.ServerToFrontend) {
	data, err := json.Marshal(msg)
	if err != nil {
		r.t.Errorf("marshal %s: %v", msg.T, err)

		return
	}

	var back muxfx.ServerToFrontend
	if err := json.Unmarshal(data, &back); err != nil {
		r.t.Errorf("unmarshal %s: %v", data, err)

		return
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	r.msgs = append(r.msgs, back)
}

func (r *wireRecorder) take() []muxfx.ServerToFrontend {
	r.mu.Lock()
	defer r.mu.Unlock()

	out := r.msgs
	r.msgs = nil

	return out
}

func screensOf(msgs []muxfx.ServerToFrontend) []muxfx.ServerToFrontend {
	var out []muxfx.ServerToFrontend

	for _, m := range msgs {
		if m.T == muxfx.MessageScreen {
			out = append(out, m)
		}
	}

	return out
}

type screenSetup struct {
	host     *fakeHost
	clock    *fakeClock
	server   *muxfx.Server
	flow     *flowTransport
	frontend muxfx.Transport[muxfx.FrontendToServer, muxfx.ServerToFrontend]
	received *wireRecorder
}

// newScreenSetup starts a server on a fake host and a fake clock with one
// frontend connected; flow puts a [flowTransport] in front of it, writable.
func newScreenSetup(t *testing.T, flow bool, mutate func(*muxfx.ServerOptions)) *screenSetup {
	t.Helper()

	s := &screenSetup{host: &fakeHost{}, clock: newFakeClock(), received: &wireRecorder{t: t}}
	opts := &muxfx.ServerOptions{
		InitialState: muxfx.NewInitialState(muxfx.Viewport{Cols: 80, Rows: 24}),
		ResolveSpawn: func(*muxfx.Pane, muxfx.Geom) muxfx.SpawnSpec { return muxfx.SpawnSpec{Command: "sh"} },
		NewHost:      s.host.factory,
		Clock:        s.clock,
	}

	if mutate != nil {
		mutate(opts)
	}

	s.server = muxfx.NewServer(opts)

	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := s.server.Dispose(ctx); err != nil {
			t.Errorf("dispose: %v", err)
		}
	})

	s.connect(flow)

	return s
}

// connect connects a new frontend, replacing the previous one.
func (s *screenSetup) connect(flow bool) {
	serverSide, frontendSide := muxfx.NewInProcessPair[muxfx.ServerToFrontend, muxfx.FrontendToServer]()
	frontendSide.OnMessage(s.received.add)
	s.frontend = frontendSide

	if flow {
		s.flow = &flowTransport{Transport: serverSide, writable: true}
		s.server.Connect(s.flow)

		return
	}

	s.server.Connect(serverSide)
}

func (s *screenSetup) attach() {
	s.frontend.Send(muxfx.FrontendToServer{T: muxfx.MessageAttach, Viewport: &muxfx.Viewport{Cols: 80, Rows: 24}})
}

// screenCopy is a frontend's copy of one pane, built from screen messages.
type screenCopy struct {
	cols, rows int
	lines      map[int][]muxfx.ScreenRun
	history    []string
	last       *muxfx.ScreenUpdate
}

func runsText(runs []muxfx.ScreenRun) string {
	var text strings.Builder

	for _, r := range runs {
		if r.Text == "" {
			text.WriteString(strings.Repeat(" ", r.Cells))

			continue
		}

		text.WriteString(r.Text)
	}

	return strings.TrimRight(text.String(), " ")
}

func (c *screenCopy) apply(t *testing.T, u *muxfx.ScreenUpdate) {
	t.Helper()

	if c.lines == nil && !u.Full {
		t.Fatalf("first screen message is a patch: %+v", u)
	}

	if u.Full {
		c.lines = map[int][]muxfx.ScreenRun{}
	}

	c.cols, c.rows = u.Cols, u.Rows

	if u.History != nil {
		if u.History.Reset {
			c.history = nil
		}

		for _, l := range u.History.Lines {
			c.history = append(c.history, runsText(l.Runs))
		}
	}

	for _, l := range u.Lines {
		for _, r := range l.Runs {
			if r.Style < 0 || r.Style >= len(u.Styles) {
				t.Errorf("row %d names style %d of %d", l.Row, r.Style, len(u.Styles))
			}
		}

		c.lines[l.Row] = l.Runs
	}

	c.last = u
}

func (c *screenCopy) text() []string {
	out := make([]string, c.rows)
	for row := range c.rows {
		out[row] = runsText(c.lines[row])
	}

	return out
}

// reference replays output into a terminal of the copy's size, which the
// server's terminal for the pane must match.
func reference(cols, rows int, output string) *vt.Terminal {
	term := vt.New(cols, rows)
	term.WriteString(output)

	return term
}

func screenText(term *vt.Terminal) []string {
	out := make([]string, term.Rows())
	for row := range out {
		out[row] = term.LineText(row)
	}

	return out
}

func historyTail(term *vt.Terminal, n int) []string {
	lines := term.History(term.HistoryLen()-n, term.HistoryLen())
	out := make([]string, len(lines))

	for i, l := range lines {
		var runs []muxfx.ScreenRun
		for _, r := range l.Runs {
			runs = append(runs, muxfx.ScreenRun{Text: r.Text, Cells: r.Cells})
		}

		out[i] = runsText(runs)
	}

	return out
}

func numbered(from, to int) string {
	var b strings.Builder
	for i := from; i <= to; i++ {
		fmt.Fprintf(&b, "line %d\r\n", i)
	}

	return b.String()
}

func TestScreenAttach(t *testing.T) {
	t.Parallel()

	t.Run("a screen frontend gets a full screen with history, then patches", func(t *testing.T) {
		t.Parallel()

		s := newScreenSetup(t, false, func(o *muxfx.ServerOptions) { o.ScreenHistory = 5 })
		s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})
		pane := s.host.spawned[0]
		output := numbered(1, 40)
		s.host.cb.OnData(pane, []byte(output))
		s.received.take()

		s.attach()

		msgs := s.received.take()
		sceneAt := slices.IndexFunc(msgs, func(m muxfx.ServerToFrontend) bool { return m.T == muxfx.MessageScene })
		screens := screensOf(msgs)

		if sceneAt < 0 || len(screens) != 1 || slices.IndexFunc(msgs, func(m muxfx.ServerToFrontend) bool { return m.T == muxfx.MessageScreen }) < sceneAt {
			t.Fatalf("messages = %+v, want a scene then one screen", msgs)
		}

		var cp screenCopy
		cp.apply(t, screens[0].Screen)

		ref := reference(cp.cols, cp.rows, output)
		if screens[0].Pane != pane || !cp.last.Full || len(cp.last.Lines) != cp.rows {
			t.Fatalf("screen = pane %q, full %v, %d rows of %d", screens[0].Pane, cp.last.Full, len(cp.last.Lines), cp.rows)
		}

		if got, want := cp.text(), screenText(ref); !slices.Equal(got, want) {
			t.Errorf("screen = %q, want %q", got, want)
		}

		if want := historyTail(ref, 5); !cp.last.History.Reset || !slices.Equal(cp.history, want) {
			t.Errorf("history = %q (reset %v), want the last 5 lines %q", cp.history, cp.last.History.Reset, want)
		}

		// One row changes: a patch with that row only, after the frame
		// interval.
		s.host.cb.OnData(pane, []byte("\x1b[1;1Hchanged"))
		s.clock.Advance(muxfx.ScreenFrameInterval)

		screens = screensOf(s.received.take())
		if len(screens) != 1 || screens[0].Screen.Full || len(screens[0].Screen.Lines) != 1 || screens[0].Screen.Lines[0].Row != 0 {
			t.Fatalf("patch = %+v, want row 0 only", screens)
		}

		cp.apply(t, screens[0].Screen)
		ref.WriteString("\x1b[1;1Hchanged")

		if got, want := cp.text(), screenText(ref); !slices.Equal(got, want) {
			t.Errorf("patched screen = %q, want %q", got, want)
		}

		if screens[0].Screen.History != nil {
			t.Errorf("patch carries history %+v, want none", screens[0].Screen.History)
		}
	})

	t.Run("a frontend that attaches while a program runs sees its screen at once", func(t *testing.T) {
		t.Parallel()

		s := newScreenSetup(t, false, nil)
		s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})
		pane := s.host.spawned[0]
		output := "\x1b]0;editor\x07\x1b[?1049h\x1b[2;3Hediting\x1b[?25l"
		s.host.cb.OnData(pane, []byte(output))
		s.received.take()

		// A new frontend replaces the first and attaches; the program
		// writes nothing more.
		for range 2 {
			s.connect(false)
			s.attach()

			screens := screensOf(s.received.take())
			if len(screens) != 1 {
				t.Fatalf("screens = %+v, want one", screens)
			}

			var cp screenCopy
			cp.apply(t, screens[0].Screen)

			if got, want := cp.text(), screenText(reference(cp.cols, cp.rows, output)); !slices.Equal(got, want) {
				t.Errorf("screen = %q, want %q", got, want)
			}

			if !cp.last.AltScreen || cp.last.Title != "editor" || cp.last.Cursor.Visible {
				t.Errorf("screen = alt %v, title %q, cursor %+v", cp.last.AltScreen, cp.last.Title, cp.last.Cursor)
			}
		}
	})

	t.Run("an attach that asks for screens, as frontends of the transition did, gets the same", func(t *testing.T) {
		t.Parallel()

		output := "\x1b[1mbold\x1b[0m plain"
		var screens [2][]muxfx.ServerToFrontend

		for i, capabilities := range [][]string{nil, {"screen"}} {
			s := newScreenSetup(t, false, nil)
			s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})
			s.host.cb.OnData(s.host.spawned[0], []byte(output))
			s.received.take()

			s.frontend.Send(muxfx.FrontendToServer{
				T: muxfx.MessageAttach, Viewport: &muxfx.Viewport{Cols: 80, Rows: 24}, Capabilities: capabilities,
			})

			screens[i] = screensOf(s.received.take())
		}

		if len(screens[0]) != 1 || !reflect.DeepEqual(screens[0], screens[1]) {
			t.Errorf("screens without the capability %+v, with it %+v; want one, the same", screens[0], screens[1])
		}
	})

	t.Run("pane output brings a screen and nothing else", func(t *testing.T) {
		t.Parallel()

		s := newScreenSetup(t, false, nil)
		s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})
		s.attach()
		s.received.take()

		s.clock.Advance(time.Second)
		s.host.cb.OnData(s.host.spawned[0], []byte("hello"))

		got := s.received.take()
		if len(got) != 1 || got[0].T != muxfx.MessageScreen {
			t.Errorf("received = %+v, want one screen", got)
		}
	})

	t.Run("a resize sends a full screen of the new size", func(t *testing.T) {
		t.Parallel()

		s := newScreenSetup(t, false, nil)
		s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})
		s.host.cb.OnData(s.host.spawned[0], []byte(numbered(1, 40)))
		s.attach()

		first := screensOf(s.received.take())
		s.clock.Advance(time.Second)
		s.frontend.Send(muxfx.FrontendToServer{T: muxfx.MessageResize, Viewport: &muxfx.Viewport{Cols: 60, Rows: 20}})

		screens := screensOf(s.received.take())
		if len(first) != 1 || len(screens) != 1 {
			t.Fatalf("screens = %d then %d, want one each", len(first), len(screens))
		}

		u := screens[0].Screen
		if !u.Full || u.Cols >= first[0].Screen.Cols || u.Rows >= first[0].Screen.Rows || len(u.Lines) != u.Rows {
			t.Errorf("after resize = full %v, %dx%d with %d rows; before %dx%d", u.Full, u.Cols, u.Rows, len(u.Lines), first[0].Screen.Cols, first[0].Screen.Rows)
		}

		if u.History == nil || !u.History.Reset || len(u.History.Lines) == 0 {
			t.Errorf("history after resize = %+v, want a reset with lines", u.History)
		}
	})

	t.Run("a new pane gets a full screen after the scene that shows it, a closed one nothing", func(t *testing.T) {
		t.Parallel()

		s := newScreenSetup(t, false, nil)
		s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})
		s.attach()
		s.received.take()

		s.clock.Advance(time.Second)
		s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionSplitPane, Direction: string(muxfx.SplitVertical)})

		msgs := s.received.take()
		second := s.host.spawned[1]

		sceneAt := slices.IndexFunc(msgs, func(m muxfx.ServerToFrontend) bool { return m.T == muxfx.MessageScene })
		screenAt := slices.IndexFunc(msgs, func(m muxfx.ServerToFrontend) bool {
			return m.T == muxfx.MessageScreen && m.Pane == second && m.Screen.Full
		})

		if sceneAt < 0 || screenAt < sceneAt {
			t.Fatalf("messages = %+v, want the scene then a full screen of %s", msgs, second)
		}

		s.clock.Advance(time.Second)
		s.host.cb.OnExit(second, 0)
		s.host.cb.OnData(second, []byte("late output"))
		s.clock.Advance(time.Second)

		for _, m := range s.received.take() {
			if m.T == muxfx.MessageScreen && m.Pane == second {
				t.Errorf("screen of a closed pane: %+v", m)
			}
		}
	})
}

func TestScreenPacing(t *testing.T) {
	t.Parallel()

	start := func(t *testing.T) (*screenSetup, muxfx.PaneID) {
		t.Helper()

		s := newScreenSetup(t, false, nil)
		s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})
		s.attach()
		s.received.take()
		s.clock.Advance(time.Second)

		return s, s.host.spawned[0]
	}

	t.Run("one frame per pane per interval", func(t *testing.T) {
		t.Parallel()

		s, pane := start(t)

		s.host.cb.OnData(pane, []byte("a"))

		if got := screensOf(s.received.take()); len(got) != 1 {
			t.Fatalf("after a quiet second, screens = %d, want 1 at once", len(got))
		}

		s.host.cb.OnData(pane, []byte("b"))
		s.clock.Advance(10 * time.Millisecond)
		s.host.cb.OnData(pane, []byte("c"))

		if got := screensOf(s.received.take()); len(got) != 0 {
			t.Fatalf("within the interval, screens = %+v, want none", got)
		}

		s.clock.Advance(muxfx.ScreenFrameInterval - 10*time.Millisecond)

		got := screensOf(s.received.take())
		if len(got) != 1 || runsText(got[0].Screen.Lines[0].Runs) != "abc" {
			t.Fatalf("at the interval, screens = %+v, want one with abc", got)
		}
	})

	t.Run("output that changes nothing sends nothing", func(t *testing.T) {
		t.Parallel()

		s, pane := start(t)

		s.host.cb.OnData(pane, []byte("\x1b[c\x1b[0m"))
		s.clock.Advance(time.Second)

		if got := screensOf(s.received.take()); len(got) != 0 {
			t.Errorf("screens = %+v, want none", got)
		}
	})

	t.Run("synchronized output holds frames up to the cap", func(t *testing.T) {
		t.Parallel()

		s, pane := start(t)

		s.host.cb.OnData(pane, []byte("\x1b[?2026hfirst"))
		s.clock.Advance(100 * time.Millisecond)
		s.host.cb.OnData(pane, []byte(" second"))
		s.clock.Advance(muxfx.SynchronizedOutputHold - 100*time.Millisecond - time.Millisecond)

		if got := screensOf(s.received.take()); len(got) != 0 {
			t.Fatalf("while synchronized output is on, screens = %+v, want none", got)
		}

		s.clock.Advance(time.Millisecond)

		got := screensOf(s.received.take())
		if len(got) != 1 || runsText(got[0].Screen.Lines[0].Runs) != "first second" {
			t.Fatalf("at the cap, screens = %+v, want one with both writes", got)
		}

		// Still on: the next frame waits for the cap again.
		s.host.cb.OnData(pane, []byte(" third"))
		s.clock.Advance(muxfx.SynchronizedOutputHold - time.Millisecond)

		if got := screensOf(s.received.take()); len(got) != 0 {
			t.Fatalf("held again, screens = %+v, want none", got)
		}

		// Turning it off sends the screen without waiting for the cap.
		s.host.cb.OnData(pane, []byte(" done\x1b[?2026l"))

		got = screensOf(s.received.take())
		if len(got) != 1 || runsText(got[0].Screen.Lines[0].Runs) != "first second third done" {
			t.Fatalf("after DECRST 2026, screens = %+v, want one at once", got)
		}
	})
}

func TestScreenSlowFrontend(t *testing.T) {
	t.Parallel()

	s := newScreenSetup(t, true, func(o *muxfx.ServerOptions) { o.ScreenHistory = 50 })
	s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})
	pane := s.host.spawned[0]

	s.flow.setWritable(false)
	s.attach()

	var output strings.Builder

	for i := range 200 {
		chunk := numbered(i*10+1, i*10+10)
		output.WriteString(chunk)
		s.host.cb.OnData(pane, []byte(chunk))
		s.clock.Advance(muxfx.ScreenFrameInterval)
	}

	if got := screensOf(s.received.take()); len(got) != 0 {
		t.Fatalf("screens while blocked = %d, want none", len(got))
	}

	// Unblocked, the frontend gets one frame: the latest screen.
	s.flow.setWritable(true)

	screens := screensOf(s.received.take())
	if len(screens) != 1 || !screens[0].Screen.Full {
		t.Fatalf("screens after unblocking = %+v, want one full", screens)
	}

	var cp screenCopy
	cp.apply(t, screens[0].Screen)

	ref := reference(cp.cols, cp.rows, output.String())
	if got, want := cp.text(), screenText(ref); !slices.Equal(got, want) {
		t.Errorf("screen = %q, want %q", got, want)
	}

	if want := historyTail(ref, 50); !slices.Equal(cp.history, want) {
		t.Errorf("history = %q, want %q", cp.history, want)
	}

	// Blocked again: the lines added meanwhile come in one patch.
	s.flow.setWritable(false)

	tail := numbered(2001, 2030)
	ref.WriteString(tail)

	for _, line := range strings.SplitAfter(tail, "\n") {
		s.host.cb.OnData(pane, []byte(line))
		s.clock.Advance(muxfx.ScreenFrameInterval)
	}

	s.flow.setWritable(true)

	screens = screensOf(s.received.take())
	if len(screens) != 1 || screens[0].Screen.Full || screens[0].Screen.History == nil || screens[0].Screen.History.Reset {
		t.Fatalf("screens after the second unblock = %+v, want one patch with added history", screens)
	}

	cp.apply(t, screens[0].Screen)

	if got, want := cp.text(), screenText(ref); !slices.Equal(got, want) {
		t.Errorf("screen = %q, want %q", got, want)
	}

	if got, want := cp.history[len(cp.history)-30:], historyTail(ref, 30); !slices.Equal(got, want) {
		t.Errorf("history tail = %q, want %q", got, want)
	}
}

func TestScreenDeviceReplies(t *testing.T) {
	t.Parallel()

	queries := "ab\x1b[c\x1b[6n"
	replies := []string{"\x1b[?1;2c", "\x1b[1;3R"}

	// The server answers whatever the frontend's state: frontends paint
	// screens and never see the queries.
	cases := []struct {
		name    string
		connect func(s *screenSetup)
	}{
		{"with an attached frontend", func(s *screenSetup) { s.attach() }},
		{"with a frontend that has not attached yet", func(*screenSetup) {}},
		{"without a frontend", func(s *screenSetup) { s.server.Disconnect(s.flow) }},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			s := newScreenSetup(t, true, nil)
			s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})
			pane := s.host.spawned[0]
			tc.connect(s)

			s.host.mu.Lock()
			s.host.writes = nil
			s.host.mu.Unlock()

			s.host.cb.OnData(pane, []byte(queries))

			s.host.mu.Lock()
			got := s.host.writes
			s.host.mu.Unlock()

			want := make([][2]string, 0, len(replies))
			for _, r := range replies {
				want = append(want, [2]string{string(pane), r})
			}

			if !slices.Equal(got, want) {
				t.Errorf("pane writes = %q, want %q", got, want)
			}
		})
	}
}

func TestScreenLiveModes(t *testing.T) {
	t.Parallel()

	s := newScreenSetup(t, false, nil)
	s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})
	pane := s.host.spawned[0]

	steps := []struct {
		output string
		msg    muxfx.FrontendToServer
		want   string
	}{
		{"", muxfx.FrontendToServer{T: muxfx.MessageKey, Key: &muxfx.KeyInput{Key: "ArrowUp", Code: "ArrowUp"}}, "\x1b[A"},
		{"\x1b[?1h", muxfx.FrontendToServer{T: muxfx.MessageKey, Key: &muxfx.KeyInput{Key: "ArrowUp", Code: "ArrowUp"}}, "\x1bOA"},
		{"\x1b[?2004h", muxfx.FrontendToServer{T: muxfx.MessagePaste, Paste: &muxfx.PasteInput{Text: "x"}}, "\x1b[200~x\x1b[201~"},
		{"\x1b[?1000h\x1b[?1006h", muxfx.FrontendToServer{T: muxfx.MessageMouse, Mouse: &muxfx.MouseInput{
			Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 1, Col: 2,
		}}, "\x1b[<0;3;2M"},
		{"\x1b[?1004h", muxfx.FrontendToServer{T: muxfx.MessageFocus, Focus: &muxfx.FocusInput{Focused: true}}, "\x1b[I"},
		{"\x1bc", muxfx.FrontendToServer{T: muxfx.MessageKey, Key: &muxfx.KeyInput{Key: "ArrowUp", Code: "ArrowUp"}}, "\x1b[A"},
	}

	for _, step := range steps {
		s.host.cb.OnData(pane, []byte(step.output))

		s.host.mu.Lock()
		s.host.writes = nil
		s.host.mu.Unlock()

		s.frontend.Send(step.msg)

		s.host.mu.Lock()
		got := s.host.writes
		s.host.mu.Unlock()

		if want := [][2]string{{string(pane), step.want}}; !slices.Equal(got, want) {
			t.Errorf("after %q, %s wrote %q, want %q", step.output, step.msg.T, got, want)
		}
	}
}

func TestScreenMessageContent(t *testing.T) {
	t.Parallel()

	s := newScreenSetup(t, false, nil)
	s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})
	pane := s.host.spawned[0]
	s.host.cb.OnData(pane, []byte("\x1b]2;title\x07\x1b[5 q\x1b[?1002h\x1b[31mred\x1b[0m 漢 \x1b]8;id=d;https://example.com\x1b\\docs\x1b]8;;\x1b\\"))
	s.attach()

	screens := screensOf(s.received.take())
	if len(screens) != 1 {
		t.Fatalf("screens = %d, want 1", len(screens))
	}

	u := screens[0].Screen
	if u.Title != "title" || u.Mouse != "drag" || u.AltScreen {
		t.Errorf("title %q, mouse %q, alt %v", u.Title, u.Mouse, u.AltScreen)
	}

	if u.Cursor.Shape != "bar" || u.Cursor.Blink == nil || !*u.Cursor.Blink || !u.Cursor.Visible || u.Cursor.X != 11 || u.Cursor.Y != 0 {
		t.Errorf("cursor = %+v, want a visible blinking bar at 11,0", u.Cursor)
	}

	runs := u.Lines[0].Runs
	want := []muxfx.ScreenRun{
		{Text: "red", Style: 1, Width: 1, Cells: 3},
		{Text: " ", Width: 1, Cells: 1},
		{Text: "漢", Width: 2, Cells: 2},
		{Text: " ", Width: 1, Cells: 1},
		{Text: "docs", Width: 1, Cells: 4, Link: runs[len(runs)-1].Link},
	}

	if !slices.Equal(runs, want) {
		t.Errorf("runs = %+v, want %+v", runs, want)
	}

	red := muxfx.ScreenStyle{Fg: vt.Color{Mode: vt.ColorPalette16, Value: 1}}
	if len(u.Styles) != 2 || u.Styles[0] != (muxfx.ScreenStyle{}) || u.Styles[1] != red {
		t.Errorf("styles = %+v, want default and red", u.Styles)
	}

	if len(u.Links) != 1 || u.Links[0] != (muxfx.ScreenLink{Link: want[4].Link, ID: "d", URI: "https://example.com"}) || want[4].Link == 0 {
		t.Errorf("links = %+v for link %d", u.Links, want[4].Link)
	}

	// Pending wrap: the cursor stays in the last column.
	s.clock.Advance(time.Second)
	s.host.cb.OnData(pane, []byte("\r\n"+strings.Repeat("x", u.Cols)))

	screens = screensOf(s.received.take())
	if len(screens) != 1 || screens[0].Screen.Cursor.X != u.Cols-1 {
		t.Errorf("cursor after filling a row = %+v, want x %d", screens, u.Cols-1)
	}
}

func TestScreenMessageJSON(t *testing.T) {
	t.Parallel()

	steady := false
	msg := muxfx.ServerToFrontend{T: muxfx.MessageScreen, Pane: "pane-1", Screen: &muxfx.ScreenUpdate{
		Cols: 20, Rows: 2,
		Cursor: muxfx.ScreenCursor{X: 3, Y: 1, Visible: true, Shape: "underline", Blink: &steady},
		Mouse:  "none",
		Styles: []muxfx.ScreenStyle{{}, {Fg: vt.Color{Mode: vt.ColorPalette16, Value: 2}, Flags: vt.FlagBold}},
		Links:  []muxfx.ScreenLink{{Link: 1, URI: "https://example.com"}},
		Lines: []muxfx.ScreenLine{{Row: 1, Runs: []muxfx.ScreenRun{
			{Text: "ok", Style: 1, Width: 1, Cells: 2},
			{Width: 1, Cells: 1},
			{Text: "site", Width: 1, Cells: 4, Link: 1},
		}}},
		History: &muxfx.ScreenHistory{Lines: []muxfx.ScreenHistoryLine{{Runs: []muxfx.ScreenRun{{Text: "$ make", Width: 1, Cells: 6}}}}},
	}}

	want := `{"t":"screen","pane":"pane-1","screen":{"full":false,"cols":20,"rows":2,` +
		`"cursor":{"x":3,"y":1,"visible":true,"shape":"underline","blink":false},"title":"","mouse":"none","altScreen":false,` +
		`"styles":[{},{"fg":{"mode":1,"value":2},"flags":1}],"links":[{"link":1,"uri":"https://example.com"}],` +
		`"lines":[[1,[["ok",1],1,["site",0,4,1,0,1]]]],` +
		`"history":{"lines":[[[["$ make"]]]]}}}`

	out, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	if string(out) != want {
		t.Errorf("marshal =\n%s\nwant\n%s", out, want)
	}

	var back muxfx.ServerToFrontend
	if err := json.Unmarshal(out, &back); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	again, err := json.Marshal(back)
	if err != nil || string(again) != want {
		t.Errorf("round trip = %s (%v)", again, err)
	}

	// An attach still decodes with the capabilities frontends of the
	// transition sent.
	var attach muxfx.FrontendToServer

	err = json.Unmarshal([]byte(`{"t":"attach","viewport":{"cols":80,"rows":24},"capabilities":["screen"]}`), &attach)
	if err != nil || attach.T != muxfx.MessageAttach || *attach.Viewport != (muxfx.Viewport{Cols: 80, Rows: 24}) {
		t.Errorf("attach = %+v (%v)", attach, err)
	}
}

func TestRemoteViewportIsBounded(t *testing.T) {
	t.Parallel()

	s := newScreenSetup(t, false, nil)
	s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})

	serverSide, frontendSide := muxfx.NewInProcessPair[muxfx.ServerToFrontend, muxfx.FrontendToServer]()
	frontendSide.OnMessage(s.received.add)
	s.server.Connect(muxfx.SanitizeRemoteTransport(serverSide))

	limit := muxfx.Viewport{Cols: muxfx.MaxRemoteViewportCols, Rows: muxfx.MaxRemoteViewportRows}

	for _, msg := range []muxfx.FrontendToServer{
		{T: muxfx.MessageAttach, Viewport: &muxfx.Viewport{Cols: 1 << 30, Rows: 1 << 30}},
		{T: muxfx.MessageResize, Viewport: &muxfx.Viewport{Cols: 100000, Rows: 100000}},
		{T: muxfx.MessageAction, Action: &muxfx.Action{Type: muxfx.ActionResizeViewport, Cols: 100000, Rows: 100000}},
	} {
		frontendSide.Send(msg)

		if got := s.server.State().Viewport; got != limit {
			t.Errorf("after %s, viewport = %+v, want %+v", msg.T, got, limit)
		}
	}

	screens := screensOf(s.received.take())
	if len(screens) == 0 {
		t.Fatal("no screen messages")
	}

	for _, m := range screens {
		if m.Screen.Cols > limit.Cols || m.Screen.Rows > limit.Rows {
			t.Errorf("pane screen %dx%d exceeds %+v", m.Screen.Cols, m.Screen.Rows, limit)
		}
	}
}

// streamChunk is a slice of a coloured log, as a build or a test run prints.
func streamChunk(seq int, size int) []byte {
	var b strings.Builder

	for i := 0; b.Len() < size; i++ {
		fmt.Fprintf(&b, "\x1b[32m%6d\x1b[0m \x1b[1mstep\x1b[0m %d of the stream, chunk %d: compiling package %d\r\n", i, i*7, seq, i%97)
	}

	return []byte(b.String())
}

// Not parallel: it measures the heap, which parallel tests would disturb.
func TestScreenMemoryStaysBoundedWithBlockedTransport(t *testing.T) {
	s := newScreenSetup(t, true, nil)
	s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})
	pane := s.host.spawned[0]

	s.flow.setWritable(false)
	s.attach()

	const chunkSize = 8 << 10

	// Fill the pane's history to its line limit first, so it no longer
	// grows.
	for i := range 256 {
		s.host.cb.OnData(pane, streamChunk(i, chunkSize))
	}

	var before, after runtime.MemStats

	runtime.GC()
	runtime.ReadMemStats(&before)

	// 16 MiB more, with time moving on as if a frame were due after every
	// chunk: a queue of frames would hold 2048 of them.
	for i := range 2048 {
		s.host.cb.OnData(pane, streamChunk(i, chunkSize))
		s.clock.Advance(muxfx.ScreenFrameInterval)
	}

	runtime.GC()
	runtime.ReadMemStats(&after)

	if got := screensOf(s.received.take()); len(got) != 0 {
		t.Fatalf("screens while blocked = %d, want none", len(got))
	}

	growth := int64(after.HeapInuse) - int64(before.HeapInuse)
	t.Logf("heap grew by %d bytes", growth)

	if growth > 4<<20 {
		t.Errorf("heap grew by %d bytes while 16 MiB streamed to a blocked frontend, want at most 4 MiB", growth)
	}

	s.flow.setWritable(true)

	if got := screensOf(s.received.take()); len(got) != 1 {
		t.Errorf("screens after unblocking = %d, want 1", len(got))
	}
}

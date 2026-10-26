// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/eser/stack/pkg/ajan/muxfx/vt"
)

// maxQueuedEvents bounds the events waiting for the server; pane readers
// block past it, which holds back a process that writes faster than the
// frontend reads.
const maxQueuedEvents = 1024

// SpawnSpec is what a [SpawnResolver] decides a pane runs.
type SpawnSpec struct {
	Command string
	Args    []string
	Cwd     string
	// Env is KEY=VALUE pairs; empty inherits the server's environment.
	Env []string
}

// SpawnResolver decides how to launch a pane's process, given the pane and
// its rectangle.
type SpawnResolver func(pane *Pane, geom Geom) SpawnSpec

// ServerOptions configures a [Server].
type ServerOptions struct {
	InitialState State
	ResolveSpawn SpawnResolver
	// Chrome is the reserved screen area; nil means [DefaultChrome].
	Chrome *Chrome
	// NewHost replaces the pseudo-terminal backend, for tests or other
	// backends; nil means [NewPtyHost].
	NewHost func(cb PtyHostCallbacks) PtyHost
	// KeepEmptySession keeps serving when the last tab closes, so a long-lived
	// host (web, daemon) can repopulate it. By default the session ends with
	// its last tab, as a TUI wants.
	KeepEmptySession bool
	// OnPaneExit runs after a pane's process exited and its paneExited action
	// was applied, so an embedding host can reconcile its own bookkeeping.
	OnPaneExit func(pane PaneID)
	// OnError receives failures the server cannot report to the frontend:
	// writes to or resizes of a pane whose process is going away.
	OnError func(err error)
	// PaneModes reports each pane's terminal modes, which decide the bytes
	// key, paste, mouse and focus messages become. nil reads the live modes
	// of the vt.Terminal the server keeps for each pane; tests set it to
	// pick modes without driving a program.
	PaneModes PaneModeSource
	// Clock paces screen messages; nil means the time package. Tests pass a
	// fake clock to step time.
	Clock Clock
	// Scrollback is how many history lines each pane's terminal keeps: zero
	// means vt.DefaultScrollback, a negative value none.
	Scrollback int
	// ScreenHistory is how many of the most recent history lines a full
	// screen message carries (on attach, resize and reconnect): zero means
	// [DefaultScreenHistory], a negative value none.
	ScreenHistory int
}

// PaneModeSource reports the current terminal modes of a pane's program:
// cursor and keypad application modes, bracketed paste, the mouse protocol
// and encoding, and focus reports. The server calls it while applying a
// frontend message, so it must not call back into the server.
type PaneModeSource interface {
	PaneModes(pane PaneID) vt.Modes
}

// PaneModeFunc adapts a function to a [PaneModeSource].
type PaneModeFunc func(pane PaneID) vt.Modes

// PaneModes calls f.
func (f PaneModeFunc) PaneModes(pane PaneID) vt.Modes {
	return f(pane)
}

// scrollSequences are sent to the focused pane's process for scroll actions
// until the server keeps a scrollback of its own.
func scrollSequence(action ScrollAction) string {
	switch action {
	case ScrollUp:
		return "\x1b[A\x1b[A\x1b[A"
	case ScrollDown:
		return "\x1b[B\x1b[B\x1b[B"
	case ScrollPageUp:
		return "\x1b[5~"
	case ScrollPageDown:
		return "\x1b[6~"
	case ScrollHome:
		return "\x1b[H"
	case ScrollEnd:
		return "\x1b[F"
	default:
		return ""
	}
}

type eventKind uint8

const (
	eventUnknown eventKind = iota
	eventAction
	eventFrontend
	eventConnect
	eventDisconnect
	eventSetChrome
	eventPaneData
	eventPaneExit
	eventWritable
	eventFlush
)

type event struct {
	kind      eventKind
	action    Action
	msg       FrontendToServer
	transport Transport[ServerToFrontend, FrontendToServer]
	chrome    Chrome
	pane      PaneID
	data      []byte
	code      int
	gen       uint64
}

// Server owns the engine state and the pane processes, runs reducer effects
// and sends the scene and the panes' screens to one connected frontend. It
// draws nothing, so it drives a terminal or a browser frontend alike. It
// feeds every pane's output into a vt.Terminal of its own and sends what
// those terminals show, so no frontend parses VT sequences.
//
// Every input (actions, frontend messages, pane output and exits) is applied
// in arrival order by one goroutine at a time: the caller that finds the
// server idle applies its own input and whatever arrives meanwhile, so a
// frontend may call back into the server from a message handler.
type Server struct {
	resolveSpawn SpawnResolver
	keepEmpty    bool
	onPaneExit   func(PaneID)
	onError      func(error)
	paneModes    PaneModeSource
	resetModes   vt.Modes
	host         PtyHost
	clock        Clock
	scrollback   int
	// screenHistory is the history lines a full screen message carries.
	screenHistory int

	mu         sync.Mutex // guards the fields below for readers outside the drain
	state      State
	baseChrome Chrome
	sink       Transport[ServerToFrontend, FrontendToServer]
	disposed   bool

	// timerStop cancels the pending screen flush due at timerAt; timerGen
	// tells its event from those of timers it replaced.
	timerStop func() bool
	timerAt   time.Time
	timerGen  uint64

	// lastScene, terms and client are only touched by the goroutine applying
	// events.
	lastScene *Scene
	terms     map[PaneID]*paneTerm
	client    *screenClient

	qmu      sync.Mutex
	qcond    *sync.Cond
	queue    []event
	draining bool

	disposeOnce sync.Once
	disposeDone chan struct{}
}

// NewServer creates a server. Dispatch newTab to open the first tab.
func NewServer(opts *ServerOptions) *Server {
	chrome := DefaultChrome()
	if opts.Chrome != nil {
		chrome = *opts.Chrome
	}

	s := &Server{
		resolveSpawn: opts.ResolveSpawn,
		keepEmpty:    opts.KeepEmptySession,
		onPaneExit:   opts.OnPaneExit,
		onError:      opts.OnError,
		paneModes:    opts.PaneModes,
		resetModes:   vt.New(minPaneCols, minPaneRows).Modes(),
		clock:        opts.Clock,
		scrollback:   opts.Scrollback,
		state:        opts.InitialState,
		baseChrome:   chrome,
		terms:        map[PaneID]*paneTerm{},
		disposeDone:  make(chan struct{}),
	}
	s.qcond = sync.NewCond(&s.qmu)

	if s.paneModes == nil {
		s.paneModes = PaneModeFunc(s.liveModes)
	}

	if s.clock == nil {
		s.clock = systemClock{}
	}

	switch {
	case opts.Scrollback == 0:
		s.scrollback = vt.DefaultScrollback
	case opts.Scrollback < 0:
		s.scrollback = 0
	}

	switch {
	case opts.ScreenHistory == 0:
		s.screenHistory = DefaultScreenHistory
	case opts.ScreenHistory > 0:
		s.screenHistory = opts.ScreenHistory
	}

	newHost := opts.NewHost
	if newHost == nil {
		newHost = NewPtyHost
	}

	s.host = newHost(PtyHostCallbacks{
		OnData: func(pane PaneID, data []byte) {
			s.post(&event{kind: eventPaneData, pane: pane, data: data}, true)
		},
		OnExit: func(pane PaneID, code int) {
			s.post(&event{kind: eventPaneExit, pane: pane, code: code}, true)
		},
	})

	return s
}

// Connect attaches a frontend transport. The server serves one frontend: a
// new transport replaces the previous one, which is closed. The panes keep
// running across reconnects.
func (s *Server) Connect(t Transport[ServerToFrontend, FrontendToServer]) {
	s.post(&event{kind: eventConnect, transport: t}, false)
}

// Disconnect detaches t if it is the current frontend, so the server stops
// sending to a dead connection.
func (s *Server) Disconnect(t Transport[ServerToFrontend, FrontendToServer]) {
	s.post(&event{kind: eventDisconnect, transport: t}, false)
}

// Dispatch applies an action from outside a frontend, such as an agent
// driver.
func (s *Server) Dispatch(action *Action) {
	s.post(&event{kind: eventAction, action: *action}, false)
}

// SetChrome changes the reserved screen area, to show or hide a sidebar.
func (s *Server) SetChrome(chrome Chrome) {
	s.post(&event{kind: eventSetChrome, chrome: chrome}, false)
}

// State returns a snapshot of the engine state.
func (s *Server) State() State {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.state
}

// Dispose stops every pane process and closes the frontend transport. It is
// safe to call more than once and from any goroutine; it returns when the
// teardown finished or ctx ended.
func (s *Server) Dispose(ctx context.Context) error {
	s.startDispose()

	select {
	case <-s.disposeDone:
		return nil
	case <-ctx.Done():
		return fmt.Errorf("dispose mux server: %w", ctx.Err())
	}
}

func (s *Server) startDispose() {
	s.disposeOnce.Do(func() {
		s.mu.Lock()
		s.disposed = true
		sink := s.sink
		s.stopTimerLocked()
		s.mu.Unlock()

		go func() {
			defer close(s.disposeDone)

			s.host.KillAll()

			if sink != nil {
				sink.Close()
			}
		}()
	})
}

// post queues an event and, when no other goroutine is applying events,
// applies the queue. wait makes a full queue block the caller (pane readers)
// instead of growing.
func (s *Server) post(ev *event, wait bool) {
	s.qmu.Lock()

	for wait && s.draining && len(s.queue) >= maxQueuedEvents {
		s.qcond.Wait()
	}

	s.queue = append(s.queue, *ev)

	if s.draining {
		s.qmu.Unlock()

		return
	}

	s.draining = true
	s.qmu.Unlock()

	s.drain()
}

func (s *Server) drain() {
	for {
		s.qmu.Lock()

		if len(s.queue) == 0 {
			s.draining = false
			s.queue = nil
			s.qmu.Unlock()

			return
		}

		ev := s.queue[0]
		s.queue[0] = event{}
		s.queue = s.queue[1:]
		s.qcond.Broadcast()
		s.qmu.Unlock()

		s.handle(&ev)
	}
}

func (s *Server) handle(ev *event) {
	switch ev.kind {
	case eventAction:
		s.applyAction(&ev.action)
	case eventFrontend:
		s.handleFrontend(&ev.msg, ev.transport)
	case eventConnect:
		s.mu.Lock()
		previous := s.sink
		s.sink = ev.transport
		s.mu.Unlock()

		s.lastScene = nil
		// A new frontend gets screens once it attaches.
		s.client = nil

		from := ev.transport
		ev.transport.OnMessage(func(msg FrontendToServer) {
			s.post(&event{kind: eventFrontend, msg: msg, transport: from}, false)
		})

		if previous != nil && previous != ev.transport {
			previous.Close()
		}
	case eventDisconnect:
		s.mu.Lock()
		if s.sink == ev.transport {
			s.sink = nil
			s.client = nil
		}
		s.mu.Unlock()
	case eventSetChrome:
		s.mu.Lock()
		s.baseChrome = ev.chrome
		s.mu.Unlock()

		s.resizePtys()
		s.broadcastScene()
		s.flushScreens()
	case eventPaneData:
		s.paneOutput(ev.pane, ev.data)
	case eventPaneExit:
		s.host.Forget(ev.pane)
		s.applyAction(&Action{Type: ActionPaneExited, Pane: ev.pane, Code: ev.code})

		if s.onPaneExit != nil {
			s.onPaneExit(ev.pane)
		}
	case eventWritable:
		if s.client != nil && s.client.transport == ev.transport {
			s.flushScreens()
		}
	case eventFlush:
		s.timerFired(ev.gen)
		s.flushScreens()
	case eventUnknown:
	}
}

func (s *Server) send(msg *ServerToFrontend) {
	s.mu.Lock()
	sink := s.sink
	s.mu.Unlock()

	if sink != nil {
		sink.Send(*msg)
	}
}

func (s *Server) reportError(err error) {
	if err != nil && s.onError != nil {
		s.onError(err)
	}
}

// currentChrome is the chrome actually applied: decorations are dropped when
// the viewport is too small. It is sent in the scene so frontends match.
func (s *Server) currentChrome() Chrome {
	return EffectiveChrome(s.state.Viewport, s.baseChrome)
}

func (s *Server) activeGeoms() map[PaneID]Geom {
	if s.state.ActiveTab < 0 || s.state.ActiveTab >= len(s.state.Tabs) {
		return map[PaneID]Geom{}
	}

	tab := s.state.Tabs[s.state.ActiveTab]

	return ComputeTabGeoms(&tab, s.state.Viewport, s.currentChrome())
}

// contentSize is a pane's size inside its border.
func (s *Server) contentSize(geom Geom, laidOut bool) (int, int) {
	if !laidOut {
		return max(1, s.state.Viewport.Cols-2), max(1, s.state.Viewport.Rows-2)
	}

	return max(1, geom.Width-2), max(1, geom.Height-2)
}

func (s *Server) spawnPane(paneID PaneID) error {
	pane, ok := s.state.Panes[paneID]
	if !ok || s.host.Has(paneID) {
		return nil
	}

	geom, laidOut := s.activeGeoms()[paneID]
	cols, rows := s.contentSize(geom, laidOut)

	if !laidOut {
		geom = Geom{Width: cols, Height: rows}
	}

	spec := s.resolveSpawn(&pane, geom)
	s.ensureTerm(paneID, cols, rows)

	return s.host.Spawn(&SpawnRequest{
		Pane:    paneID,
		Command: spec.Command,
		Args:    spec.Args,
		Cwd:     spec.Cwd,
		Env:     spec.Env,
		Cols:    cols,
		Rows:    rows,
	})
}

func (s *Server) resizePtys() {
	for paneID, geom := range s.activeGeoms() {
		cols, rows := s.contentSize(geom, true)

		s.resizeTerm(paneID, cols, rows)

		if !s.host.Has(paneID) {
			continue
		}

		s.reportError(s.host.Resize(paneID, cols, rows))
	}
}

func (s *Server) broadcastScene() {
	next := DeriveScene(&s.state, s.currentChrome())
	full := s.lastScene == nil
	delta := DiffScene(s.lastScene, &next)
	s.lastScene = &next

	if delta != nil {
		s.send(&ServerToFrontend{T: MessageScene, Full: full, Delta: delta})
	}
}

func (s *Server) runEffect(effect *Effect) {
	switch effect.Type {
	case EffectSpawnPty:
		if err := s.spawnPane(effect.Pane); err != nil {
			// Show the failure in the pane instead of swallowing it; the pane
			// stays closeable and says why it did not start.
			s.paneOutput(effect.Pane, []byte("\r\n[mux] failed to start pane: "+err.Error()+"\r\n"))
		}
	case EffectWritePty:
		s.reportError(s.host.Write(effect.Pane, []byte(effect.Data)))
	case EffectKillPty:
		if s.host.Has(effect.Pane) {
			s.host.Kill(effect.Pane)
		}
	case EffectScrollPane:
		s.reportError(s.host.Write(effect.Pane, []byte(scrollSequence(effect.Scroll))))
	case EffectRender:
		// The scene is sent after every action; nothing more to do.
	case EffectDetach:
		s.send(&ServerToFrontend{T: MessageExit, Code: 0})
	case EffectExit:
		// A long-lived host keeps serving an empty multiplexer; the scene sent
		// after this action shows no tabs, so the client can repopulate it.
		if s.keepEmpty {
			return
		}

		s.send(&ServerToFrontend{T: MessageExit, Code: 0})
		s.startDispose()
	}
}

func (s *Server) applyAction(action *Action) {
	s.mu.Lock()
	if s.disposed {
		s.mu.Unlock()

		return
	}

	result := Reduce(&s.state, action)
	s.state = result.State
	s.mu.Unlock()

	for i := range result.Effects {
		s.runEffect(&result.Effects[i])
	}

	s.pruneTerms()
	s.resizePtys()
	s.broadcastScene()
	s.flushScreens()
}

// handleFrontend applies a message that arrived on transport from.
func (s *Server) handleFrontend(msg *FrontendToServer, from Transport[ServerToFrontend, FrontendToServer]) {
	switch msg.T {
	case MessageAttach:
		if msg.Viewport == nil {
			return
		}

		s.mu.Lock()
		s.state.Viewport = *msg.Viewport
		s.mu.Unlock()

		s.setClient(from)
		s.lastScene = nil // the newly attached frontend needs a full scene
		s.resizePtys()
		s.broadcastScene()
		s.flushScreens()
	case MessageAction:
		if msg.Action != nil {
			s.applyAction(msg.Action)
		}
	case MessageResize:
		if msg.Viewport != nil {
			s.applyAction(&Action{Type: ActionResizeViewport, Cols: msg.Viewport.Cols, Rows: msg.Viewport.Rows})
		}
	case MessageKey, MessagePaste, MessageMouse, MessageFocus:
		s.writeUserInput(msg)
	case MessageScene, MessageScreen, MessageExit:
	}
}

// inputPane is the pane a key, paste, mouse or focus message goes to: the
// pane it names when that exists, else the focused pane of the active tab.
func (s *Server) inputPane(requested PaneID) (PaneID, bool) {
	if requested != "" {
		_, ok := s.state.Panes[requested]

		return requested, ok
	}

	tab, ok := activeTabOf(&s.state)
	if !ok || tab.FocusedPane == "" {
		return "", false
	}

	return tab.FocusedPane, true
}

// mouseInPane reports whether a mouse event's cell lies inside the content
// of a pane on screen; xterm.js drops events outside the terminal too.
func (s *Server) mouseInPane(pane PaneID, ev *MouseInput) bool {
	geom, laidOut := s.activeGeoms()[pane]
	if !laidOut {
		return false
	}

	cols, rows := s.contentSize(geom, true)

	return ev.Col < cols && ev.Row < rows
}

// writeUserInput encodes a key, paste, mouse or focus message with its
// pane's current modes and writes the bytes to the pane through the
// reducer, as a writeToPane action does. A message that encodes to nothing
// in those modes is dropped.
func (s *Server) writeUserInput(msg *FrontendToServer) {
	pane, ok := s.inputPane(msg.Pane)
	if !ok {
		return
	}

	modes := s.paneModes.PaneModes(pane)

	var data []byte

	switch {
	case msg.T == MessageKey && msg.Key != nil:
		data = EncodeKey(msg.Key, modes)
	case msg.T == MessagePaste && msg.Paste != nil:
		data = EncodePaste(msg.Paste.Text, modes)
	case msg.T == MessageMouse && msg.Mouse != nil:
		if s.mouseInPane(pane, msg.Mouse) {
			data = EncodeMouse(msg.Mouse, modes)
		}
	case msg.T == MessageFocus && msg.Focus != nil:
		data = EncodeFocus(msg.Focus.Focused, modes)
	}

	if len(data) == 0 {
		return
	}

	s.applyAction(&Action{Type: ActionWriteToPane, Pane: pane, Data: string(data)})
}

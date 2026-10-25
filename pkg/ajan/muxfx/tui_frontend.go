// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx

import (
	"cmp"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"slices"
	"sync"
	"time"

	"github.com/eser/stack/pkg/ajan/shellfx/tui"
)

// ErrFrontendStarted is returned by Run on a frontend that already ran.
var ErrFrontendStarted = errors.New("frontend already started")

const defaultSizePollInterval = 250 * time.Millisecond

// maxHiddenScreens bounds the screens a [TuiFrontend] keeps of panes the
// scene does not show (other tabs, panes behind a fullscreen one), so it
// can draw them at once when they come back. The scene names only the
// panes on show, so a closed pane cannot be told from a hidden one; past
// this many, the ones least recently updated or shown are dropped and come
// back blank until their program writes.
const maxHiddenScreens = 32

// Frontend consumes the server feed (scene and screens) and produces actions.
type Frontend interface {
	// Handle applies a message from the server.
	Handle(msg ServerToFrontend)
	// Run attaches and pumps input until stopped.
	Run(ctx context.Context) error
	// Stop restores the terminal and tears down.
	Stop()
	// Refresh asks for a redraw, for example after decoration data changed.
	Refresh()
}

// DecorateFunc draws consumer content into the chrome's reserved regions.
type DecorateFunc func(regions DecorationRegions, scene *Scene) string

// TuiFrontendOptions configures a [TuiFrontend]. Transport and Keymap are
// required; the terminal hooks default to the process's own terminal.
type TuiFrontendOptions struct {
	Transport Transport[FrontendToServer, ServerToFrontend]
	Keymap    Keymap
	// SizePollInterval is how often the terminal size is checked; zero means
	// 250ms. A SIGWINCH also triggers a check.
	SizePollInterval time.Duration
	// Decorate draws decorations (a sidebar, a status strip) every frame.
	Decorate DecorateFunc
	// OnKey sees a key before the keymap; returning true consumes it.
	OnKey func(key *KeyEvent, scene *Scene) bool
	// OnMouse sees a mouse event first; returning true consumes it.
	OnMouse func(ev *MouseEvent, scene *Scene) bool
	// StatusText replaces the mode hints in the status bar.
	StatusText string

	// Input and Output default to os.Stdin and os.Stdout.
	Input  io.Reader
	Output io.Writer
	// TerminalSize defaults to the size of os.Stdout, or 80x24.
	TerminalSize func() Viewport
	// SetRaw switches the input terminal in and out of raw mode; it defaults
	// to shellfx/tui's raw mode on os.Stdin.
	SetRaw func(enable bool) error
}

// TuiFrontend draws the multiplexer in an ANSI terminal. It keeps a copy of
// each pane's screen, rebuilt from the server's screen messages, so it
// parses no pane output itself. It
// composites the screens with the scene on a coalescing scheduler and turns
// input into actions, sending what the user types as writeInput bytes. It
// talks to the server only through the protocol, so it draws a remote
// server's panes as it draws an in-process one's.
type TuiFrontend struct {
	opts      TuiFrontendOptions
	scheduler *Scheduler

	mu           sync.Mutex
	scene        *Scene
	screens      map[PaneID]*paneScreen
	useSeq       uint64
	lastViewport Viewport
	running      bool
	started      bool
	stopped      bool
	reader       *tui.KeypressReader

	done     chan struct{}
	stopOnce sync.Once

	// outputLost is closed when a write to the output fails; the size poller
	// then stops the frontend, since the terminal is gone.
	outputLost     chan struct{}
	outputLostOnce sync.Once
}

func defaultTerminalSize() Viewport {
	size, err := tui.GetTerminalSize()
	if err != nil {
		// Not a terminal (a pipe or CI): draw for a classic 80x24.
		return Viewport{Cols: 80, Rows: 24}
	}

	return Viewport{Cols: size.Cols, Rows: size.Rows}
}

// NewTuiFrontend creates a frontend; call Run to start it.
func NewTuiFrontend(opts *TuiFrontendOptions) *TuiFrontend {
	f := &TuiFrontend{
		opts:         *opts,
		screens:      map[PaneID]*paneScreen{},
		lastViewport: Viewport{Cols: 80, Rows: 24},
		done:         make(chan struct{}),
		outputLost:   make(chan struct{}),
	}

	if f.opts.Input == nil {
		f.opts.Input = os.Stdin
	}

	if f.opts.Output == nil {
		f.opts.Output = os.Stdout
	}

	if f.opts.TerminalSize == nil {
		f.opts.TerminalSize = defaultTerminalSize
	}

	if f.opts.SetRaw == nil {
		f.opts.SetRaw = tui.SetStdinRaw
	}

	if f.opts.SizePollInterval <= 0 {
		f.opts.SizePollInterval = defaultSizePollInterval
	}

	f.scheduler = NewScheduler(f.render, DefaultFrameInterval)

	// Take messages from the start, so a screen that arrives before Run
	// reaches the pane's copy instead of being lost.
	f.opts.Transport.OnMessage(f.Handle)

	return f
}

// writeLocked writes to the output; the caller holds f.mu. A failed write
// means the terminal is gone: rendering ends and the frontend stops.
func (f *TuiFrontend) writeLocked(s string) {
	if _, err := io.WriteString(f.opts.Output, s); err != nil {
		f.stopped = true
		f.outputLostOnce.Do(func() { close(f.outputLost) })
	}
}

// touch marks a screen as just used.
func (f *TuiFrontend) touch(screen *paneScreen) {
	f.useSeq++
	screen.seen = f.useSeq
}

// pruneScreensLocked keeps the screens of the panes on show and at most
// [maxHiddenScreens] others, the most recently used.
func (f *TuiFrontend) pruneScreensLocked() {
	shown := map[PaneID]bool{}

	if f.scene != nil {
		for _, p := range f.scene.Panes {
			shown[p.ID] = true

			if screen, ok := f.screens[p.ID]; ok {
				f.touch(screen)
			}
		}
	}

	hidden := make([]PaneID, 0, len(f.screens))

	for id := range f.screens {
		if !shown[id] {
			hidden = append(hidden, id)
		}
	}

	if len(hidden) <= maxHiddenScreens {
		return
	}

	slices.SortFunc(hidden, func(a, b PaneID) int {
		return cmp.Compare(f.screens[a].seen, f.screens[b].seen)
	})

	for _, id := range hidden[:len(hidden)-maxHiddenScreens] {
		delete(f.screens, id)
	}
}

func (f *TuiFrontend) render(full bool) {
	f.mu.Lock()
	defer f.mu.Unlock()

	if !f.running || f.stopped || f.scene == nil {
		return
	}

	frame := composite(f.scene, f.screens, full, f.opts.StatusText)

	out := seqHideCursor + frame.Data

	if f.opts.Decorate != nil {
		out += f.opts.Decorate(ComputeDecorationRegions(f.scene.Viewport, f.scene.Chrome), f.scene)
	}

	out += moveTo(frame.CursorRow, frame.CursorCol)
	if frame.CursorVisible {
		out += seqShowCursor
	}

	f.writeLocked(out)
}

// Handle applies a server message: a scene delta, a pane's screen or exit.
// It is safe to call from any goroutine.
func (f *TuiFrontend) Handle(msg ServerToFrontend) {
	switch msg.T {
	case MessageScene:
		if msg.Delta == nil {
			return
		}

		f.mu.Lock()
		next := ApplyDelta(f.scene, msg.Delta, f.lastViewport)
		f.scene = &next

		d := msg.Delta
		structural := msg.Full || d.HasPanes() || d.HasTabs() || d.Viewport != nil || d.Chrome != nil

		if structural {
			f.pruneScreensLocked()
		}
		f.mu.Unlock()

		if structural {
			f.scheduler.RequestFull()
		} else {
			f.scheduler.Schedule()
		}
	case MessageScreen:
		if msg.Screen == nil {
			return
		}

		f.mu.Lock()
		screen, ok := f.screens[msg.Pane]
		if !ok {
			screen = newPaneScreen()
			f.screens[msg.Pane] = screen
		}

		screen.apply(msg.Screen)
		f.touch(screen)

		if !ok {
			f.pruneScreensLocked()
		}
		f.mu.Unlock()

		f.scheduler.Schedule()
	case MessageExit:
		f.Stop()
	case MessageAttach, MessageAction, MessageResize:
	}
}

// Refresh asks for a redraw.
func (f *TuiFrontend) Refresh() {
	f.mu.Lock()
	stopped := f.stopped
	f.mu.Unlock()

	if !stopped {
		f.scheduler.Schedule()
	}
}

// Stop restores the terminal (mouse off, cursor shown, alternate screen left)
// and closes the transport. It does nothing before Run and is safe to call
// more than once.
func (f *TuiFrontend) Stop() {
	f.mu.Lock()
	running := f.running
	f.mu.Unlock()

	if !running {
		return
	}

	f.stopOnce.Do(func() {
		f.mu.Lock()
		f.running = false
		f.stopped = true
		reader := f.reader
		f.writeLocked(seqDisableMouse + seqShowCursor + seqExitAltScreen)
		f.mu.Unlock()

		f.scheduler.Stop()
		close(f.done)

		// Run closes a reader it creates after this point itself.
		if reader != nil {
			reader.Close()
		}

		f.opts.Transport.Close()
	})
}

func (f *TuiFrontend) checkSize() {
	vp := f.opts.TerminalSize()

	f.mu.Lock()
	changed := vp != f.lastViewport
	f.lastViewport = vp
	f.mu.Unlock()

	if changed {
		f.opts.Transport.Send(FrontendToServer{T: MessageResize, Viewport: &vp})
	}
}

// Run enters the alternate screen and raw mode, attaches, and pumps input
// until the frontend stops, the server sends exit or ctx ends.
func (f *TuiFrontend) Run(ctx context.Context) error {
	f.mu.Lock()
	if f.started {
		f.mu.Unlock()

		return ErrFrontendStarted
	}

	f.started = true
	f.running = true
	f.writeLocked(seqEnterAltScreen + seqHideCursor + seqClearScreen + seqEnableMouse)
	f.mu.Unlock()

	vp := f.opts.TerminalSize()

	f.mu.Lock()
	f.lastViewport = vp
	f.mu.Unlock()

	f.opts.Transport.Send(FrontendToServer{T: MessageAttach, Viewport: &vp})

	if err := f.opts.SetRaw(true); err != nil {
		f.Stop()

		return fmt.Errorf("enter raw mode: %w", err)
	}

	defer func() { _ = f.opts.SetRaw(false) }() // best effort: the terminal may already be gone

	reader := tui.NewKeypressReader(ctx, f.opts.Input)

	f.mu.Lock()
	f.reader = reader
	stoppedEarly := f.stopped
	f.mu.Unlock()

	if stoppedEarly {
		// Stop ran before the reader existed, so it could not close it.
		reader.Close()

		return nil
	}

	var wg sync.WaitGroup

	wg.Go(func() { f.pollSize(ctx) })

	f.pumpInput(reader)
	f.Stop()
	wg.Wait()

	return nil
}

func (f *TuiFrontend) pollSize(ctx context.Context) {
	ticker := time.NewTicker(f.opts.SizePollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			f.Stop()

			return
		case <-f.done:
			return
		case <-f.outputLost:
			f.Stop()

			return
		case <-ticker.C:
			f.checkSize()
		}
	}
}

func (f *TuiFrontend) pumpInput(reader *tui.KeypressReader) {
	for {
		ev, ok := reader.Read()
		if !ok {
			return
		}

		select {
		case <-f.done:
			return
		default:
		}

		if ev.Name == "resize" {
			f.checkSize()

			continue
		}

		raw, err := base64.StdEncoding.DecodeString(ev.Raw)
		if err != nil || len(raw) == 0 {
			continue
		}

		for _, msg := range f.messagesFor(raw) {
			f.opts.Transport.Send(msg)
		}
	}
}

// messagesFor maps one read of input to messages, joining consecutive pane
// input into one write so a paste reaches the pane in one piece.
func (f *TuiFrontend) messagesFor(raw []byte) []FrontendToServer {
	f.mu.Lock()

	var scene *Scene

	if f.scene != nil {
		copied := *f.scene
		scene = &copied
	}
	f.mu.Unlock()

	mode := ModeNormal
	if scene != nil {
		mode = scene.Mode
	}

	var out []FrontendToServer

	for _, ev := range DecodeInput(raw) {
		for _, msg := range f.eventMessages(&ev, scene, mode) {
			if n := len(out); n > 0 && isWriteInput(&out[n-1]) && isWriteInput(&msg) {
				merged := *out[n-1].Action
				merged.Data += msg.Action.Data
				out[n-1].Action = &merged

				continue
			}

			out = append(out, msg)
		}
	}

	return out
}

func isWriteInput(msg *FrontendToServer) bool {
	return msg.T == MessageAction && msg.Action != nil && msg.Action.Type == ActionWriteInput
}

// eventMessages runs the interceptors and the keymap for one event. A
// panicking interceptor drops the event instead of ending the input pump.
func (f *TuiFrontend) eventMessages(ev *InputEvent, scene *Scene, mode InputMode) (msgs []FrontendToServer) {
	defer func() {
		if r := recover(); r != nil {
			msgs = nil
		}
	}()

	if ev.Mouse != nil {
		if f.opts.OnMouse != nil && f.opts.OnMouse(ev.Mouse, scene) {
			return nil
		}

		return MouseToMessages(ev.Mouse, scene)
	}

	if f.opts.OnKey != nil && f.opts.OnKey(ev.Key, scene) {
		return nil
	}

	return KeyToMessages(ev.Key, mode, f.opts.Keymap)
}

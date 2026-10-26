// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx

import (
	"maps"
	"slices"
	"time"

	"github.com/eser/stack/pkg/ajan/muxfx/vt"
)

const (
	// DefaultScreenHistory is how many history lines a full screen message
	// carries unless [ServerOptions.ScreenHistory] says otherwise.
	DefaultScreenHistory = 1000
	// ScreenFrameInterval is the shortest time between two screen messages
	// for one pane; changes in between are sent together.
	ScreenFrameInterval = 16 * time.Millisecond
	// SynchronizedOutputHold is the longest a pane's screen message waits
	// while its program has synchronized output (DECSET 2026) on; past it
	// the screen is sent anyway.
	SynchronizedOutputHold = 200 * time.Millisecond
)

// paneTerm is the server's emulation of one pane: the terminal its output
// goes into and the replies the terminal produced while writing it.
type paneTerm struct {
	term    *vt.Terminal
	replies [][]byte
}

func newPaneTerm(cols, rows, scrollback int) *paneTerm {
	pt := &paneTerm{}
	pt.term = vt.New(cols, rows,
		vt.WithScrollback(scrollback),
		vt.WithReplyWriter(func(reply []byte) {
			pt.replies = append(pt.replies, slices.Clone(reply))
		}),
	)

	return pt
}

// write feeds output to the terminal and returns the replies it produced
// (cursor position, device attributes), for the PTY.
func (pt *paneTerm) write(data []byte) [][]byte {
	_, _ = pt.term.Write(data)

	replies := pt.replies
	pt.replies = nil

	return replies
}

// clientPane is a screen frontend's state for one pane: what it was last
// sent (the dirty-row state) and when the next frame may go.
type clientPane struct {
	view      paneView
	dirty     bool
	full      bool
	lastFrame time.Time
	holdSince time.Time
}

// screenClient is the attached frontend, which the server sends screens.
type screenClient struct {
	transport Transport[ServerToFrontend, FrontendToServer]
	flow      FlowControl
	panes     map[PaneID]*clientPane
}

func newScreenClient(t Transport[ServerToFrontend, FrontendToServer]) *screenClient {
	c := &screenClient{transport: t, panes: map[PaneID]*clientPane{}}

	if flow, ok := t.(FlowControl); ok {
		c.flow = flow
	}

	return c
}

func (c *screenClient) writable() bool {
	return c.flow == nil || c.flow.Writable()
}

// pane returns the state for a pane, a new one owing a full frame.
func (c *screenClient) pane(id PaneID) *clientPane {
	cp, ok := c.panes[id]
	if !ok {
		cp = &clientPane{full: true}
		c.panes[id] = cp
	}

	return cp
}

// ensureTerm creates the terminal of a pane about to start.
func (s *Server) ensureTerm(pane PaneID, cols, rows int) {
	if _, ok := s.terms[pane]; ok {
		return
	}

	s.terms[pane] = newPaneTerm(cols, rows, s.scrollback)

	if s.client != nil {
		s.client.pane(pane).full = true
	}
}

// resizeTerm resizes a pane's terminal with its PTY; the screen frontend
// then owes the pane a full frame.
func (s *Server) resizeTerm(pane PaneID, cols, rows int) {
	// vt raises sizes below 2 columns or 1 row to those (vt.New); a resize
	// to what the terminal already is would still re-wrap its history.
	cols, rows = max(cols, 2), max(rows, 1)

	pt, ok := s.terms[pane]
	if !ok || (pt.term.Cols() == cols && pt.term.Rows() == rows) {
		return
	}

	pt.term.Resize(cols, rows)

	if s.client != nil {
		s.client.pane(pane).full = true
	}
}

// pruneTerms drops the terminals of panes that are gone.
func (s *Server) pruneTerms() {
	for id := range s.terms {
		if _, ok := s.state.Panes[id]; ok {
			continue
		}

		delete(s.terms, id)

		if s.client != nil {
			delete(s.client.panes, id)
		}
	}
}

// paneOutput takes output of a pane's program into its terminal, writes the
// replies the terminal produced (cursor position, device attributes) back to
// the pane, and marks the pane for the attached frontend's next frame.
// Output before attach only changes the terminal: the attach brings a full
// screen.
func (s *Server) paneOutput(pane PaneID, data []byte) {
	pt, ok := s.terms[pane]
	if !ok {
		return
	}

	for _, reply := range pt.write(data) {
		s.reportError(s.host.Write(pane, reply))
	}

	if s.client == nil {
		return
	}

	s.client.pane(pane).dirty = true
	s.flushScreens()
}

// setClient makes the frontend that attached on from the screen frontend,
// owing every pane a full frame. An attach from a transport that is no
// longer the frontend changes nothing.
func (s *Server) setClient(from Transport[ServerToFrontend, FrontendToServer]) {
	s.mu.Lock()
	sink := s.sink
	s.mu.Unlock()

	if from == nil || from != sink {
		return
	}

	s.client = newScreenClient(sink)

	if s.client.flow != nil {
		s.client.flow.OnWritable(func() {
			s.post(&event{kind: eventWritable, transport: sink}, false)
		})
	}
}

// flushScreens sends a screen message for every pane of the screen frontend
// that changed or owes a full frame, at most one per pane every
// [ScreenFrameInterval], held while synchronized output is on up to
// [SynchronizedOutputHold], and only while the transport is writable. Panes
// that have to wait arm the timer.
func (s *Server) flushScreens() {
	c := s.client
	if c == nil || s.isDisposed() {
		return
	}

	now := s.clock.Now()

	var wake time.Time

	for _, id := range slices.Sorted(maps.Keys(s.terms)) {
		if !c.writable() {
			// The transport calls back when it can take more; the panes stay
			// marked until then.
			return
		}

		cp := c.pane(id)
		if !cp.dirty && !cp.full {
			continue
		}

		if due := cp.lastFrame.Add(ScreenFrameInterval); !cp.lastFrame.IsZero() && now.Before(due) {
			wake = earliest(wake, due)

			continue
		}

		term := s.terms[id].term

		if term.Modes().SynchronizedOutput {
			if cp.holdSince.IsZero() {
				cp.holdSince = now
			}

			if due := cp.holdSince.Add(SynchronizedOutputHold); now.Before(due) {
				wake = earliest(wake, due)

				continue
			}
		}

		update, changed := buildFrame(term, &cp.view, cp.full, s.screenHistory)
		cp.dirty, cp.full, cp.holdSince = false, false, time.Time{}

		if !changed {
			continue
		}

		cp.lastFrame = now
		c.transport.Send(ServerToFrontend{T: MessageScreen, Pane: id, Screen: &update})
	}

	if !wake.IsZero() {
		s.armTimer(now, wake)
	}
}

func earliest(a, b time.Time) time.Time {
	if a.IsZero() || b.Before(a) {
		return b
	}

	return a
}

// armTimer makes sure a flush runs at at: it keeps a timer due no later and
// replaces a later one.
func (s *Server) armTimer(now, at time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.disposed || (s.timerStop != nil && !s.timerAt.After(at)) {
		return
	}

	if s.timerStop != nil {
		s.timerStop()
	}

	s.timerGen++
	gen := s.timerGen
	s.timerAt = at
	s.timerStop = s.clock.AfterFunc(at.Sub(now), func() {
		s.post(&event{kind: eventFlush, gen: gen}, false)
	})
}

// timerFired forgets the timer that posted gen, unless a newer one replaced
// it.
func (s *Server) timerFired(gen uint64) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if gen == s.timerGen {
		s.timerStop = nil
		s.timerAt = time.Time{}
	}
}

// stopTimerLocked cancels the pending flush; the caller holds s.mu.
func (s *Server) stopTimerLocked() {
	if s.timerStop != nil {
		s.timerStop()
		s.timerStop = nil
		s.timerAt = time.Time{}
	}
}

func (s *Server) isDisposed() bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.disposed
}

// liveModes is the [PaneModeSource] used without [ServerOptions.PaneModes]:
// the current modes of each pane's terminal, or a reset terminal's for a
// pane without one. It runs while the server applies a message.
func (s *Server) liveModes(pane PaneID) vt.Modes {
	if pt, ok := s.terms[pane]; ok {
		return pt.term.Modes()
	}

	return s.resetModes
}

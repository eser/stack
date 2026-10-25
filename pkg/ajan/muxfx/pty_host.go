// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx

import (
	"errors"
	"fmt"
	"strconv"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/eser/stack/pkg/ajan/shellfx/pty"
)

// ErrUnknownPane is returned for a pane the host has no process for.
var ErrUnknownPane = errors.New("pane has no running process")

// killGrace is how long KillAll waits after SIGTERM before SIGKILL, and then
// how long it waits for the SIGKILL to land.
const killGrace = 2 * time.Second

// SpawnRequest says how to start a pane's process.
type SpawnRequest struct {
	Pane    PaneID
	Command string
	Args    []string
	Cwd     string
	// Env is the child's environment as KEY=VALUE pairs; empty inherits the
	// server's.
	Env  []string
	Cols int
	Rows int
}

// PtyHostCallbacks receive pane output and exits. They run on the host's
// reader goroutines. OnData owns the slice it is given.
type PtyHostCallbacks struct {
	OnData func(pane PaneID, data []byte)
	OnExit func(pane PaneID, code int)
}

// PtyHost owns the live process of each pane. The server talks to it only
// through this interface, so tests and other backends can replace it.
type PtyHost interface {
	Spawn(req *SpawnRequest) error
	Write(pane PaneID, data []byte) error
	Resize(pane PaneID, cols, rows int) error
	// Kill stops a pane's process with SIGTERM; its exit is still reported.
	Kill(pane PaneID)
	// Forget drops a pane whose process already exited, sending no signal.
	Forget(pane PaneID)
	// KillAll stops every process, escalating to SIGKILL for those that ignore
	// SIGTERM, and returns once their readers are done (or the grace periods
	// ran out).
	KillAll()
	Has(pane PaneID) bool
}

type hostSession struct {
	pane    PaneID
	session *pty.Session
	size    string
	done    chan struct{}
}

// ptyHost is the PtyHost backed by shellfx/pty.
type ptyHost struct {
	cb PtyHostCallbacks

	mu      sync.Mutex
	live    map[PaneID]*hostSession
	running map[*hostSession]struct{}
}

// NewPtyHost returns the default host: one shellfx/pty pseudo-terminal per
// pane and one reader goroutine each, ended by the process exit.
func NewPtyHost(cb PtyHostCallbacks) PtyHost {
	return &ptyHost{
		cb:      cb,
		live:    map[PaneID]*hostSession{},
		running: map[*hostSession]struct{}{},
	}
}

func sizeKey(cols, rows int) string {
	return strconv.Itoa(cols) + "x" + strconv.Itoa(rows)
}

func (h *ptyHost) Spawn(req *SpawnRequest) error {
	h.mu.Lock()
	_, exists := h.live[req.Pane]
	h.mu.Unlock()

	if exists {
		return nil
	}

	session, err := pty.Spawn(pty.SpawnOptions{
		Command: req.Command,
		Args:    req.Args,
		Cwd:     req.Cwd,
		Env:     req.Env,
		Cols:    req.Cols,
		Rows:    req.Rows,
	})
	if err != nil {
		return fmt.Errorf("spawn %q for pane %q: %w", req.Command, req.Pane, err)
	}

	hs := &hostSession{
		pane:    req.Pane,
		session: session,
		size:    sizeKey(req.Cols, req.Rows),
		done:    make(chan struct{}),
	}

	h.mu.Lock()
	h.live[req.Pane] = hs
	h.running[hs] = struct{}{}
	h.mu.Unlock()

	go h.pump(hs)

	return nil
}

// utf8Boundary returns how much of data ends on a whole UTF-8 sequence, so a
// character split between two reads is sent whole with the next one.
func utf8Boundary(data []byte) int {
	for back := 1; back <= utf8.UTFMax-1 && back <= len(data); back++ {
		b := data[len(data)-back]
		if !utf8.RuneStart(b) {
			continue
		}

		need := 0

		switch {
		case b&0xE0 == 0xC0:
			need = 2
		case b&0xF0 == 0xE0:
			need = 3
		case b&0xF8 == 0xF0:
			need = 4
		}

		if need > back {
			return len(data) - back
		}

		return len(data)
	}

	return len(data)
}

func (h *ptyHost) pump(hs *hostSession) {
	defer close(hs.done)

	var carry []byte

	for {
		chunk, ok := hs.session.Read()
		if !ok {
			break
		}

		data := make([]byte, 0, len(carry)+len(chunk))
		data = append(append(data, carry...), chunk...)
		cut := utf8Boundary(data)
		carry = append([]byte(nil), data[cut:]...)

		if cut > 0 && h.cb.OnData != nil {
			h.cb.OnData(hs.pane, data[:cut])
		}
	}

	if len(carry) > 0 && h.cb.OnData != nil {
		h.cb.OnData(hs.pane, carry)
	}

	code := hs.session.Close()

	h.mu.Lock()
	delete(h.running, hs)
	h.mu.Unlock()

	if h.cb.OnExit != nil {
		h.cb.OnExit(hs.pane, code)
	}
}

func (h *ptyHost) get(pane PaneID) (*hostSession, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()

	hs, ok := h.live[pane]

	return hs, ok
}

func (h *ptyHost) Write(pane PaneID, data []byte) error {
	hs, ok := h.get(pane)
	if !ok {
		return fmt.Errorf("write to pane %q: %w", pane, ErrUnknownPane)
	}

	if err := hs.session.Write(data); err != nil {
		return fmt.Errorf("write to pane %q: %w", pane, err)
	}

	return nil
}

func (h *ptyHost) Resize(pane PaneID, cols, rows int) error {
	h.mu.Lock()

	hs, ok := h.live[pane]
	if !ok {
		h.mu.Unlock()

		return fmt.Errorf("resize pane %q: %w", pane, ErrUnknownPane)
	}

	key := sizeKey(cols, rows)
	if hs.size == key {
		h.mu.Unlock()

		return nil
	}

	hs.size = key
	h.mu.Unlock()

	if err := hs.session.Resize(cols, rows); err != nil {
		return fmt.Errorf("resize pane %q to %s: %w", pane, key, err)
	}

	return nil
}

func (h *ptyHost) Kill(pane PaneID) {
	h.mu.Lock()
	hs, ok := h.live[pane]
	delete(h.live, pane)
	h.mu.Unlock()

	if ok {
		// The process may already be gone; there is nothing to do about a
		// failed signal then, and its exit is reported either way.
		_ = hs.session.Kill("SIGTERM")
	}
}

func (h *ptyHost) Forget(pane PaneID) {
	h.mu.Lock()
	delete(h.live, pane)
	h.mu.Unlock()
}

func (h *ptyHost) Has(pane PaneID) bool {
	_, ok := h.get(pane)

	return ok
}

// waitDone waits for the sessions' readers to finish, up to timeout, and
// returns the ones still running.
func waitDone(sessions []*hostSession, timeout time.Duration) []*hostSession {
	deadline := time.NewTimer(timeout)
	defer deadline.Stop()

	var left []*hostSession

	for i, hs := range sessions {
		select {
		case <-hs.done:
		case <-deadline.C:
			left = append(left, sessions[i:]...)

			return pendingOnly(left)
		}
	}

	return nil
}

func pendingOnly(sessions []*hostSession) []*hostSession {
	out := sessions[:0]

	for _, hs := range sessions {
		select {
		case <-hs.done:
		default:
			out = append(out, hs)
		}
	}

	return out
}

func (h *ptyHost) KillAll() {
	h.mu.Lock()

	sessions := make([]*hostSession, 0, len(h.running))
	for hs := range h.running {
		sessions = append(sessions, hs)
	}

	clear(h.live)
	h.mu.Unlock()

	for _, hs := range sessions {
		_ = hs.session.Kill("SIGTERM") // a process that already exited cannot be signalled
	}

	left := waitDone(sessions, killGrace)
	for _, hs := range left {
		_ = hs.session.Kill("SIGKILL") // as above
	}

	waitDone(left, killGrace)
}

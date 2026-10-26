// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx

import (
	"sync"
	"time"
)

// DefaultFrameInterval is about 60 frames a second.
const DefaultFrameInterval = 16 * time.Millisecond

// Scheduler coalesces render requests: any number of Schedule calls within a
// frame interval produce one render, and RequestFull makes that render a full
// repaint.
type Scheduler struct {
	render   func(full bool)
	interval time.Duration

	mu      sync.Mutex
	timer   *time.Timer
	pending bool
	full    bool
	stopped bool
}

// NewScheduler returns a scheduler calling render at most once per interval
// (DefaultFrameInterval when interval is zero). render runs on a timer
// goroutine.
func NewScheduler(render func(full bool), interval time.Duration) *Scheduler {
	if interval <= 0 {
		interval = DefaultFrameInterval
	}

	return &Scheduler{render: render, interval: interval}
}

// Schedule requests a render on the next frame.
func (s *Scheduler) Schedule() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.scheduleLocked()
}

func (s *Scheduler) scheduleLocked() {
	if s.pending || s.stopped {
		return
	}

	s.pending = true
	s.timer = time.AfterFunc(s.interval, s.fire)
}

// RequestFull requests a full repaint on the next frame.
func (s *Scheduler) RequestFull() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.full = true
	s.scheduleLocked()
}

func (s *Scheduler) fire() {
	s.mu.Lock()
	if s.stopped {
		s.mu.Unlock()

		return
	}

	s.pending = false
	s.timer = nil
	full := s.full
	s.full = false
	s.mu.Unlock()

	s.render(full)
}

// Stop cancels a pending frame; later requests are ignored. A render already
// running is not interrupted.
func (s *Scheduler) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.stopped = true
	s.pending = false

	if s.timer != nil {
		s.timer.Stop()
		s.timer = nil
	}
}

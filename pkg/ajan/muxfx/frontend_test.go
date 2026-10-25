// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx_test

import (
	"bytes"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/muxfx"
)

// syncBuffer is an io.Writer safe for the frontend's render goroutine.
type syncBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *syncBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	return b.buf.Write(p)
}

func (b *syncBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()

	return b.buf.String()
}

func TestSchedulerCoalesces(t *testing.T) {
	t.Parallel()

	var (
		renders atomic.Int32
		full    atomic.Bool
	)

	done := make(chan struct{}, 4)

	s := muxfx.NewScheduler(func(isFull bool) {
		renders.Add(1)
		full.Store(isFull)
		done <- struct{}{}
	}, 5*time.Millisecond)
	defer s.Stop()

	s.Schedule()
	s.Schedule()
	s.RequestFull()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("no render")
	}

	time.Sleep(30 * time.Millisecond)

	if renders.Load() != 1 || !full.Load() {
		t.Errorf("renders = %d, full = %v, want one full render", renders.Load(), full.Load())
	}

	s.Stop()
	s.Schedule()
	time.Sleep(30 * time.Millisecond)

	if renders.Load() != 1 {
		t.Errorf("a stopped scheduler rendered")
	}
}

func TestTuiFrontendDrawsNothingBeforeRun(t *testing.T) {
	t.Parallel()

	output := &syncBuffer{}
	serverSide, frontendSide := muxfx.NewInProcessPair[muxfx.ServerToFrontend, muxfx.FrontendToServer]()
	_ = muxfx.NewTuiFrontend(&muxfx.TuiFrontendOptions{
		Transport: frontendSide,
		Keymap:    muxfx.DefaultKeymap(),
		Output:    output,
	})

	s := split(t, ptr(baseState(t)))
	scene := muxfx.DeriveScene(&s, muxfx.DefaultChrome())

	// Before Run, messages are taken in but nothing is drawn.
	serverSide.Send(muxfx.ServerToFrontend{T: muxfx.MessageScene, Full: true, Delta: muxfx.DiffScene(nil, &scene)})
	serverSide.Send(muxfx.ServerToFrontend{T: muxfx.MessageScreen, Pane: "pane-1", Screen: &muxfx.ScreenUpdate{
		Full: true, Cols: 5, Rows: 1, Styles: []muxfx.ScreenStyle{{}},
		Lines: []muxfx.ScreenLine{{Row: 0, Runs: []muxfx.ScreenRun{{Text: "hello", Width: 1, Cells: 5}}}},
	}})
	serverSide.Send(muxfx.ServerToFrontend{T: muxfx.MessageExit})

	time.Sleep(4 * muxfx.DefaultFrameInterval)

	if got := output.String(); got != "" {
		t.Errorf("output before Run = %q", got)
	}
}

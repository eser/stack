// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !windows && !wasip1

package muxfx_test

import (
	"context"
	"os"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/muxfx"
)

// These tests run real processes on pseudo-terminals and are not parallel:
// they compare goroutine counts before and after, which other tests running
// at the same time would disturb. Go runs them before the parallel tests.

const leakWait = 5 * time.Second

// goroutineStacks returns the stack of every goroutine except the
// process-wide os/signal loop, which the first signal.Notify starts for good
// (shellfx/tui watches SIGWINCH) and which is not owned by this package.
func goroutineStacks() []string {
	buf := make([]byte, 1<<20)
	buf = buf[:runtime.Stack(buf, true)]

	var stacks []string

	for _, stack := range strings.Split(string(buf), "\n\n") {
		if strings.Contains(stack, "os/signal.loop") {
			continue
		}

		stacks = append(stacks, stack)
	}

	return stacks
}

// expectNoGoroutineLeak fails the test if the goroutine count does not come
// back to baseline once the test is done.
func expectNoGoroutineLeak(t *testing.T, baseline int) {
	t.Helper()

	deadline := time.Now().Add(leakWait)

	for {
		stacks := goroutineStacks()
		if len(stacks) <= baseline {
			return
		}

		if time.Now().After(deadline) {
			t.Fatalf("goroutines = %d, want at most %d; stacks:\n%s", len(stacks), baseline, strings.Join(stacks, "\n\n"))
		}

		time.Sleep(20 * time.Millisecond)
	}
}

func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()

	deadline := time.Now().Add(leakWait)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}

		time.Sleep(10 * time.Millisecond)
	}
}

func shResolver(script string) muxfx.SpawnResolver {
	return func(*muxfx.Pane, muxfx.Geom) muxfx.SpawnSpec {
		return muxfx.SpawnSpec{Command: "/bin/sh", Args: []string{"-c", script}}
	}
}

func TestPtyServerLeavesNoGoroutines(t *testing.T) {
	baseline := len(goroutineStacks())

	server := muxfx.NewServer(&muxfx.ServerOptions{
		InitialState: muxfx.NewInitialState(muxfx.Viewport{Cols: 80, Rows: 24}),
		// The pane ignores SIGTERM, so disposing has to escalate to SIGKILL.
		ResolveSpawn: shResolver(`trap "" TERM; printf READY; while :; do sleep 1; done`),
	})
	serverSide, frontendSide := muxfx.NewInProcessPair[muxfx.ServerToFrontend, muxfx.FrontendToServer]()

	var (
		mu    sync.Mutex
		ready = map[muxfx.PaneID]bool{}
	)

	frontendSide.OnMessage(func(msg muxfx.ServerToFrontend) {
		if msg.T != muxfx.MessageScreen {
			return
		}

		mu.Lock()
		defer mu.Unlock()

		for _, line := range msg.Screen.Lines {
			if strings.Contains(runsText(line.Runs), "READY") {
				ready[msg.Pane] = true
			}
		}
	})
	server.Connect(serverSide)
	frontendSide.Send(muxfx.FrontendToServer{T: muxfx.MessageAttach, Viewport: &muxfx.Viewport{Cols: 80, Rows: 24}})
	server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})
	server.Dispatch(&muxfx.Action{Type: muxfx.ActionSplitPane, Direction: string(muxfx.SplitVertical)})

	waitFor(t, "both panes to show READY", func() bool {
		mu.Lock()
		defer mu.Unlock()

		return len(ready) >= 2
	})

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Dispose(ctx); err != nil {
		t.Fatalf("dispose: %v", err)
	}

	expectNoGoroutineLeak(t, baseline)
}

func TestTuiFrontendEndToEnd(t *testing.T) {
	baseline := len(goroutineStacks())

	server := muxfx.NewServer(&muxfx.ServerOptions{
		InitialState: muxfx.NewInitialState(muxfx.Viewport{Cols: 60, Rows: 12}),
		ResolveSpawn: shResolver(`printf READY; read line; printf "got:%s" "$line"; sleep 0.2`),
	})
	serverSide, frontendSide := muxfx.NewInProcessPair[muxfx.ServerToFrontend, muxfx.FrontendToServer]()
	server.Connect(serverSide)

	// An os.Pipe, unlike io.Pipe, supports read deadlines, so stopping the
	// frontend interrupts the pending read at once, as it does on a terminal.
	input, inputWriter, err := os.Pipe()
	if err != nil {
		t.Fatalf("pipe: %v", err)
	}

	defer func() { _ = input.Close() }()

	output := &syncBuffer{}

	frontend := muxfx.NewTuiFrontend(&muxfx.TuiFrontendOptions{
		Transport:    frontendSide,
		Keymap:       muxfx.DefaultKeymap(),
		Input:        input,
		Output:       output,
		TerminalSize: func() muxfx.Viewport { return muxfx.Viewport{Cols: 60, Rows: 12} },
		SetRaw:       func(bool) error { return nil },
	})

	server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})

	runDone := make(chan error, 1)

	go func() { runDone <- frontend.Run(context.Background()) }()

	waitFor(t, "the pane to render READY", func() bool { return strings.Contains(output.String(), "READY") })

	if _, err := inputWriter.Write([]byte("hello\r")); err != nil {
		t.Fatalf("type: %v", err)
	}

	// The pane exits after answering; its tab was the last, so the server
	// ends the session and the frontend stops.
	select {
	case err := <-runDone:
		if err != nil {
			t.Fatalf("run: %v", err)
		}
	case <-time.After(leakWait):
		t.Fatal("frontend did not stop after the session ended")
	}

	if !strings.Contains(output.String(), "got:hello") {
		t.Errorf("output never showed the answer:\n%q", output.String())
	}

	if !strings.HasSuffix(output.String(), "\x1b[?1049l") {
		t.Error("the frontend did not leave the alternate screen last")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Dispose(ctx); err != nil {
		t.Fatalf("dispose: %v", err)
	}

	_ = inputWriter.Close()

	expectNoGoroutineLeak(t, baseline)
}

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx_test

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/muxfx"
)

// tuiRun is a TUI frontend running on a pipe for input and a buffer for
// output, connected to a server.
type tuiRun struct {
	frontend *muxfx.TuiFrontend
	output   *syncBuffer
	done     chan error
}

func startTui(t *testing.T, server *muxfx.Server, viewport muxfx.Viewport, beforeRun func()) *tuiRun {
	t.Helper()

	serverSide, frontendSide := muxfx.NewInProcessPair[muxfx.ServerToFrontend, muxfx.FrontendToServer]()
	server.Connect(serverSide)

	input, inputWriter, err := os.Pipe()
	if err != nil {
		t.Fatalf("pipe: %v", err)
	}

	t.Cleanup(func() {
		_ = inputWriter.Close()
		_ = input.Close()
	})

	run := &tuiRun{output: &syncBuffer{}, done: make(chan error, 1)}
	run.frontend = muxfx.NewTuiFrontend(&muxfx.TuiFrontendOptions{
		Transport:    frontendSide,
		Keymap:       muxfx.DefaultKeymap(),
		Input:        input,
		Output:       run.output,
		TerminalSize: func() muxfx.Viewport { return viewport },
		SetRaw:       func(bool) error { return nil },
	})

	if beforeRun != nil {
		beforeRun()
	}

	go func() { run.done <- run.frontend.Run(context.Background()) }()

	return run
}

func (r *tuiRun) stop(t *testing.T) {
	t.Helper()

	r.frontend.Stop()

	select {
	case err := <-r.done:
		if err != nil {
			t.Errorf("run: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("frontend did not stop")
	}
}

// newTuiServer starts a server on a fake host, disposed when the test ends.
func newTuiServer(t *testing.T, viewport muxfx.Viewport) (*muxfx.Server, *fakeHost) {
	t.Helper()

	host := &fakeHost{}
	server := muxfx.NewServer(&muxfx.ServerOptions{
		InitialState: muxfx.NewInitialState(viewport),
		ResolveSpawn: func(*muxfx.Pane, muxfx.Geom) muxfx.SpawnSpec { return muxfx.SpawnSpec{Command: "sh"} },
		NewHost:      host.factory,
	})

	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := server.Dispose(ctx); err != nil {
			t.Errorf("dispose: %v", err)
		}
	})

	return server, host
}

func TestTuiFrontendShowsCurrentScreenOnAttach(t *testing.T) {
	t.Parallel()

	viewport := muxfx.Viewport{Cols: 60, Rows: 12}
	server, host := newTuiServer(t, viewport)

	first := startTui(t, server, viewport, func() { server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab}) })

	waitFor(t, "the pane to start", func() bool { return host.Has("pane-1") })
	host.cb.OnData("pane-1", []byte("\x1b[32mbuilt\x1b[0m ok\r\n$ "))

	waitFor(t, "the first frontend to paint the output", func() bool { return strings.Contains(first.output.String(), "built") })

	// A second frontend takes the session over. Nothing new is written to
	// the pane, so what it shows can only come from the server's screen.
	second := startTui(t, server, viewport, nil)
	first.stop(t)

	// The pane's content starts at row 3, column 2: under the tab bar and
	// inside the border.
	waitFor(t, "the second frontend to paint the current screen", func() bool {
		return strings.Contains(second.output.String(), "\x1b[3;2H\x1b[32mbuilt\x1b[0m ok")
	})

	if !strings.Contains(second.output.String(), "\x1b[4;2H$ ") {
		t.Errorf("the prompt row is missing:\n%q", second.output.String())
	}

	// Later output reaches it as patches.
	host.cb.OnData("pane-1", []byte("ls"))

	waitFor(t, "the second frontend to paint a patch", func() bool {
		return strings.Contains(second.output.String(), "\x1b[4;2H$ ls")
	})

	second.stop(t)
}

func TestTuiFrontendKeepsTheScreensOfHiddenPanes(t *testing.T) {
	t.Parallel()

	viewport := muxfx.Viewport{Cols: 60, Rows: 12}
	server, host := newTuiServer(t, viewport)

	run := startTui(t, server, viewport, func() { server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab}) })

	waitFor(t, "the pane to start", func() bool { return host.Has("pane-1") })
	host.cb.OnData("pane-1", []byte("kept"))
	waitFor(t, "the pane to paint", func() bool { return strings.Contains(run.output.String(), "\x1b[3;2Hkept") })

	// Two more tabs hide the pane behind scene changes that redraw the
	// whole frame; nothing new is written to it.
	server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})
	server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})
	waitFor(t, "the third tab", func() bool { return strings.Contains(run.output.String(), " 3:") })

	mark := len(run.output.String())

	server.Dispatch(&muxfx.Action{Type: muxfx.ActionGotoTab, Index: muxfx.IntPtr(0)})

	waitFor(t, "the first tab to show its pane again", func() bool {
		return strings.Contains(run.output.String()[mark:], "\x1b[3;2Hkept")
	})

	run.stop(t)
}

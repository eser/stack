// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !windows && !wasip1

package noskillsserverfx

import (
	"context"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/eser/stack/pkg/ajan/muxfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// muxWait bounds every wait on a mux worker, so a hang fails the test.
const muxWait = 10 * time.Second

func newTestMuxWorker(t *testing.T, cwd string) *muxWorker {
	t.Helper()

	handle, err := spawnMuxWorker(t.Context(), "s-mux", cwd, logfx.NewLogger(logfx.WithWriter(io.Discard)))
	require.NoError(t, err)

	worker, ok := handle.(*muxWorker)
	require.True(t, ok, "spawnMuxWorker returned %T", handle)

	t.Cleanup(func() {
		_ = worker.Close() // the tests that close it check the result themselves
	})

	return worker
}

// writeScript writes an executable shell script named name into dir.
func writeScript(t *testing.T, dir, name, body string) string {
	t.Helper()

	path := filepath.Join(dir, name)
	require.NoError(t, os.WriteFile(path, []byte("#!/bin/sh\n"+body), 0o700)) //nolint:gosec // G306: the script has to be executable

	return path
}

// nextEvent returns the next event, failing the test when none arrives in
// time or the stream has ended.
func nextEvent(t *testing.T, events <-chan WorkerEvent) WorkerEvent {
	t.Helper()

	select {
	case evt, ok := <-events:
		require.True(t, ok, "the event stream ended")

		return evt
	case <-time.After(muxWait):
		t.Fatal("no event in time")

		return WorkerEvent{}
	}
}

// joinTestSocket attaches a socket to the worker's mux frames, as an attach
// does, for the test to read with nextFrame.
func joinTestSocket(t *testing.T, worker *muxWorker) *queuedSocket {
	t.Helper()

	socket := newQueuedSocket()
	worker.joinRemote(socket)
	t.Cleanup(func() { worker.leaveRemote(socket) })

	return socket
}

// nextFrame decodes the next frame queued on socket, failing the test when
// none arrives in time.
func nextFrame(t *testing.T, socket *queuedSocket) map[string]any {
	t.Helper()

	select {
	case frame := <-socket.frames():
		socket.drained()

		var msg map[string]any

		require.NoError(t, json.Unmarshal(frame, &msg), "frame %s", frame)

		return msg
	case <-time.After(muxWait):
		t.Fatal("no frame in time")

		return nil
	}
}

// waitForScreen attaches socket's client and reads frames until a pane's
// painted screen holds want. The viewport is wide enough that the temporary
// paths the tests print do not wrap.
func waitForScreen(t *testing.T, worker *muxWorker, socket *queuedSocket, want string) {
	t.Helper()

	require.NoError(t, worker.SendMux(t.Context(), json.RawMessage(`{"t":"attach","viewport":{"cols":500,"rows":30}}`)))

	painters := map[muxfx.PaneID]*screenPainter{}
	deadline := time.After(muxWait)

	for {
		select {
		case raw := <-socket.frames():
			socket.drained()

			var frame muxfx.ServerToFrontend

			require.NoError(t, json.Unmarshal(raw, &frame), "frame %s", raw)

			if frame.T != muxfx.MessageScreen {
				continue
			}

			painter, ok := painters[frame.Pane]
			if !ok {
				painter = newScreenPainter()
				painters[frame.Pane] = painter
			}

			painter.apply(frame.Screen)

			if strings.Contains(painter.text(), want) {
				return
			}
		case <-deadline:
			screens := make([]string, 0, len(painters))
			for _, painter := range painters {
				screens = append(screens, painter.text())
			}

			t.Fatalf("no screen ever held %q; they were %q", want, screens)
		}
	}
}

// waitForEnd drains events until the stream closes.
func waitForEnd(t *testing.T, events <-chan WorkerEvent) {
	t.Helper()

	deadline := time.After(muxWait)

	for {
		select {
		case _, ok := <-events:
			if !ok {
				return
			}
		case <-deadline:
			t.Fatal("the event stream did not end")
		}
	}
}

// TestMuxWorkerSendsTheHandshakeFirst pins the two spawn_progress events the
// TypeScript worker sent, byte for byte: clients and the ledger see them.
func TestMuxWorkerSendsTheHandshakeFirst(t *testing.T) {
	t.Parallel()

	worker := newTestMuxWorker(t, t.TempDir())

	first := nextEvent(t, worker.Events())
	second := nextEvent(t, worker.Events())

	assert.Equal(t, WorkerEvent{Type: "spawn_progress", Payload: []byte(`{"type":"spawn_progress","stage":"starting"}`)}, first)
	assert.Equal(t, WorkerEvent{Type: "spawn_progress", Payload: []byte(`{"type":"spawn_progress","stage":"ready"}`)}, second)
}

// TestMuxWorkerAnswersAttachWithAFullScene pins the frame a client gets for
// its attach: a full scene with every field the browser renderer reads.
func TestMuxWorkerAnswersAttachWithAFullScene(t *testing.T) {
	t.Parallel()

	worker := newTestMuxWorker(t, t.TempDir())
	socket := joinTestSocket(t, worker)

	require.NoError(t, worker.SendMux(t.Context(), json.RawMessage(`{"t":"attach","viewport":{"cols":80,"rows":24}}`)))

	frame := nextFrame(t, socket)

	assert.Equal(t, "scene", frame["t"])
	assert.Equal(t, true, frame["full"])

	delta, ok := frame["delta"].(map[string]any)
	require.True(t, ok, "delta = %v", frame["delta"])

	keys := make([]string, 0, len(delta))
	for key := range delta {
		keys = append(keys, key)
	}

	slices.Sort(keys)
	assert.Equal(t, []string{"activeTab", "chrome", "focusedPane", "mode", "panes", "tabs", "viewport"}, keys)
	assert.Equal(t, map[string]any{"cols": float64(80), "rows": float64(24)}, delta["viewport"])
}

// TestMuxWorkerRejectsAFrameThatIsNotAnObject pins that SendMux refuses what
// the TypeScript worker skipped: a "mux" message whose frame is not an
// object.
func TestMuxWorkerRejectsAFrameThatIsNotAnObject(t *testing.T) {
	t.Parallel()

	worker := newTestMuxWorker(t, t.TempDir())

	for _, frame := range []string{``, `null`, `[1]`, `"attach"`, `42`} {
		err := worker.SendMux(t.Context(), json.RawMessage(frame))
		assert.ErrorIs(t, err, ErrMuxFrameNotObject, "frame %q", frame)
	}

	err := worker.SendMux(t.Context(), json.RawMessage(`{"t":`))
	require.Error(t, err)
	assert.NotErrorIs(t, err, ErrMuxFrameNotObject)
}

// TestMuxWorkerQueryStartOpensTheFirstTab pins what query_start does: a tab
// running claude in the session's directory, with the session in its meta and
// in NOSKILLS_SESSION and NOSKILLS_PROJECT_ROOT.
func TestMuxWorkerQueryStartOpensTheFirstTab(t *testing.T) {
	bin := t.TempDir()
	writeScript(t, bin, "claude", `printf 'claude:%s:%s:%s\n' "$NOSKILLS_SESSION" "$NOSKILLS_PROJECT_ROOT" "$(pwd -P)"
read -r line
`)
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))

	root := realPath(t, t.TempDir())
	worker := newTestMuxWorker(t, t.TempDir())
	socket := joinTestSocket(t, worker)

	require.NoError(t, worker.SendQueryStart(t.Context(), root, "s-query", ""))

	waitForScreen(t, worker, socket, "claude:s-query:"+root+":"+root)

	state := worker.server.State()
	require.Len(t, state.Tabs, 1)
	require.Len(t, state.Panes, 1)

	for _, pane := range state.Panes {
		assert.Equal(t, muxFirstTabCommand, pane.Command)
		assert.Equal(t, root, pane.Cwd)
		assert.Equal(t, muxFirstTabTitle, pane.Title)
		assert.Equal(t, map[string]string{"sessionId": "s-query"}, pane.Meta)
	}
}

// TestMuxWorkerSanitizesClientFrames pins that a client cannot choose what a
// pane runs: the command, arguments and directory of a newTab it sends are
// dropped, and the pane runs the user's shell in the session's directory.
func TestMuxWorkerSanitizesClientFrames(t *testing.T) {
	bin := t.TempDir()
	shell := writeScript(t, bin, "shell", `printf 'shell:%s\n' "$(pwd -P)"
read -r line
`)
	t.Setenv("SHELL", shell)

	root := realPath(t, t.TempDir())
	worker := newTestMuxWorker(t, root)
	socket := joinTestSocket(t, worker)

	frame := `{"t":"action","action":{"type":"newTab","command":"/bin/echo","args":["pwned"],"cwd":"/","title":"x"}}`
	require.NoError(t, worker.SendMux(t.Context(), json.RawMessage(frame)))

	waitForScreen(t, worker, socket, "shell:"+root)

	for _, pane := range worker.server.State().Panes {
		assert.Empty(t, pane.Command)
		assert.Empty(t, pane.Args)
		assert.Empty(t, pane.Cwd)
		assert.Equal(t, "x", pane.Title)
	}
}

// TestMuxWorkerResolveSpawn pins the Go form of buildAgentSpawnResolver.
func TestMuxWorkerResolveSpawn(t *testing.T) {
	t.Setenv("SHELL", "/bin/test-shell")
	t.Setenv(envPaneSession, "inherited")

	worker := &muxWorker{cwd: "/project", querySession: "s-query"} //nolint:exhaustruct

	tests := []struct {
		name        string
		pane        muxfx.Pane
		wantCommand string
		wantCwd     string
		wantSession string
	}{
		{
			name:        "a pane with no command runs the shell",
			pane:        muxfx.Pane{},
			wantCommand: "/bin/test-shell",
			wantCwd:     "/project",
			wantSession: "s-query",
		},
		{
			name:        "a pane's own command, directory and session win",
			pane:        muxfx.Pane{Command: "claude", Cwd: "/elsewhere", Meta: map[string]string{"sessionId": "s-pane"}},
			wantCommand: "claude",
			wantCwd:     "/elsewhere",
			wantSession: "s-pane",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			spec := worker.resolveSpawn(&tc.pane, muxfx.Geom{})

			assert.Equal(t, tc.wantCommand, spec.Command)
			assert.Equal(t, tc.wantCwd, spec.Cwd)

			sessions := []string{}
			roots := []string{}

			for _, entry := range spec.Env {
				if value, ok := strings.CutPrefix(entry, envPaneSession+"="); ok {
					sessions = append(sessions, value)
				}

				if value, ok := strings.CutPrefix(entry, envPaneProjectRoot+"="); ok {
					roots = append(roots, value)
				}
			}

			assert.Equal(t, []string{tc.wantSession}, sessions)
			assert.Equal(t, []string{"/project"}, roots)
		})
	}
}

// TestMuxWorkerShellFallsBackToBinSh pins the shell used when SHELL is unset.
func TestMuxWorkerShellFallsBackToBinSh(t *testing.T) {
	t.Setenv("SHELL", "")

	worker := &muxWorker{cwd: "/project"} //nolint:exhaustruct

	assert.Equal(t, muxDefaultShell, worker.resolveSpawn(&muxfx.Pane{}, muxfx.Geom{}).Command) //nolint:exhaustruct
}

// TestMuxWorkerStopTaskEndsTheSession pins that a client's stop ends a mux
// session, as stop_task did in the TypeScript worker: the event stream
// closes, which is how the pump learns the session is over.
func TestMuxWorkerStopTaskEndsTheSession(t *testing.T) {
	t.Setenv("SHELL", "/bin/sh")

	worker := newTestMuxWorker(t, t.TempDir())
	require.NoError(t, worker.SendMux(t.Context(), json.RawMessage(`{"t":"action","action":{"type":"newTab"}}`)))

	require.NoError(t, worker.StopTask(t.Context()))

	waitForEnd(t, worker.Events())

	assert.ErrorIs(t, worker.SendMux(t.Context(), json.RawMessage(`{"t":"attach"}`)), ErrMuxWorkerClosed)
	assert.ErrorIs(t, worker.SendQueryStart(t.Context(), "", "", ""), ErrMuxWorkerClosed)
	require.NoError(t, worker.Close(), "a second close")
}

// TestMuxWorkerCloseReturnsWhileNobodyReads pins that Close does not wait on
// a client: a pane writes faster than anyone reads, the client's queue stops
// growing at the screen window instead of dropping the client, and Close
// still stops the pane and closes the stream in time while nobody reads the
// events either.
func TestMuxWorkerCloseReturnsWhileNobodyReads(t *testing.T) {
	bin := t.TempDir()
	t.Setenv("SHELL", writeScript(t, bin, "flood", "while :; do echo flood; done\n"))

	worker := newTestMuxWorker(t, t.TempDir())
	socket := joinTestSocket(t, worker)
	require.NoError(t, worker.SendMux(t.Context(), json.RawMessage(`{"t":"action","action":{"type":"newTab"}}`)))
	require.NoError(t, worker.SendMux(t.Context(), json.RawMessage(`{"t":"attach","viewport":{"cols":80,"rows":24}}`)))

	deadline := time.After(muxWait)
	for socket.backlog() < muxScreenWindow {
		select {
		case <-deadline:
			t.Fatalf("the pane never filled the screen window; backlog %d", socket.backlog())
		case <-time.After(10 * time.Millisecond):
		}
	}

	// The pane keeps flooding for many frame intervals; no screen joins the
	// queue.
	time.Sleep(20 * muxfx.ScreenFrameInterval)

	assert.LessOrEqual(t, socket.backlog(), muxScreenWindow, "frames waiting")

	select {
	case <-socket.stopped():
		t.Fatal("the client was dropped")
	default:
	}

	closed := make(chan error, 1)

	go func() { closed <- worker.Close() }()

	select {
	case err := <-closed:
		require.NoError(t, err)
	case <-time.After(muxDisposeTimeout + muxWait):
		t.Fatal("Close did not return")
	}

	waitForEnd(t, worker.Events())
}

// TestMuxWorkerSendsNothingOnceTheRequestEnded pins that a send for a request
// that has ended does not start.
func TestMuxWorkerSendsNothingOnceTheRequestEnded(t *testing.T) {
	t.Parallel()

	worker := newTestMuxWorker(t, t.TempDir())

	ended, cancel := context.WithCancel(t.Context())
	cancel()

	err := worker.SendMux(ended, json.RawMessage(`{"t":"attach","viewport":{"cols":80,"rows":24}}`))
	require.ErrorIs(t, err, context.Canceled)

	_, err = spawnMuxWorker(ended, "s-ended", t.TempDir(), logfx.NewLogger(logfx.WithWriter(io.Discard)))
	require.ErrorIs(t, err, context.Canceled)
}

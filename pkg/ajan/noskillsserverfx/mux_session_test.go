// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !windows && !wasip1

package noskillsserverfx

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/muxfx"
	wt "github.com/quic-go/webtransport-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// jsRuntimes are the programs the TypeScript mux worker ran under.
var jsRuntimes = []string{"node", "deno", "bun"} //nolint:gochecknoglobals // test fixture

// pathWithoutJSRuntimes returns PATH with first in front and without every
// directory that holds one of jsRuntimes.
func pathWithoutJSRuntimes(first string) string {
	dirs := []string{first}

	for _, dir := range filepath.SplitList(os.Getenv("PATH")) {
		if dir == "" {
			continue
		}

		holdsRuntime := false

		for _, name := range jsRuntimes {
			if info, err := os.Stat(filepath.Join(dir, name)); err == nil && !info.IsDir() { //nolint:gosec // G703: the test's own PATH, read to drop entries from it
				holdsRuntime = true

				break
			}
		}

		if !holdsRuntime {
			dirs = append(dirs, dir)
		}
	}

	return strings.Join(dirs, string(os.PathListSeparator))
}

// TestMuxSessionRunsWithoutAJavaScriptRuntime runs a kind=mux session through
// the daemon, over WebTransport, with no node, deno or bun on PATH. The client
// speaks the protocol the TypeScript clients speak (noskills-client's attach
// and the web UI's mux-remote.js): {"type":"mux","frame":...} lines in, and
// sequenced {"type":"mux","v":1,"frame":...} lines out.
//
// The first tab runs claude, as the TypeScript worker's did; a stand-in claude
// on PATH echoes what it reads, which proves input reaches the pane and its
// output comes back on the pane's screen. The CI job mux-no-js-runtime runs this test.
func TestMuxSessionRunsWithoutAJavaScriptRuntime(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	bin := t.TempDir()
	writeScript(t, bin, "claude", `while read -r line; do printf 'claude-got:%s:%s\n' "$NOSKILLS_SESSION" "$line"; done
`)
	t.Setenv("PATH", pathWithoutJSRuntimes(bin))
	t.Setenv("SHELL", "/bin/sh")

	for _, name := range jsRuntimes {
		_, err := exec.LookPath(name)
		require.Error(t, err, "%s is still on PATH", name)
	}

	f := startAttachFixture(t)

	root := t.TempDir()
	require.NoError(t, f.srv.saveDaemonState(DaemonState{Projects: map[string]string{"proj": root}}))

	sess, err := f.client.ConnectWithHeaders(t.Context(), f.baseURL+"s-mux?kind=mux", f.headers)
	require.NoError(t, err, "attach")

	stream, err := sess.OpenBidiStreamSync(t.Context())
	require.NoError(t, err)
	require.NoError(t, stream.SetReadDeadline(time.Now().Add(2*muxWait)))

	send := func(line string) {
		t.Helper()

		_, err := stream.Write([]byte(line + "\n"))
		require.NoError(t, err)
	}

	scanner := bufio.NewScanner(stream)
	scanner.Buffer(make([]byte, 0, 64*1024), 1<<20)

	var (
		lastSeq int64
		painter = newScreenPainter()
		stages  []string
	)

	// readUntil reads daemon lines until done holds, checking the envelope of
	// each: a seq that never goes back, and v 1 on every mux frame.
	readUntil := func(what string, done func(frame map[string]any) bool) {
		t.Helper()

		for scanner.Scan() {
			var msg struct {
				Type  string          `json:"type"`
				V     int             `json:"v"`
				Seq   int64           `json:"seq"`
				Stage string          `json:"stage"`
				Frame json.RawMessage `json:"frame"`
			}

			require.NoError(t, json.Unmarshal(scanner.Bytes(), &msg), "line %q", scanner.Text())
			// The replay start and the first replayed line both carry seq 1.
			require.GreaterOrEqual(t, msg.Seq, lastSeq, "line %q", scanner.Text())
			lastSeq = msg.Seq

			switch msg.Type {
			case "spawn_progress":
				stages = append(stages, msg.Stage)
			case "mux":
				require.Equal(t, 1, msg.V, "line %q", scanner.Text())

				var frame map[string]any

				require.NoError(t, json.Unmarshal(msg.Frame, &frame), "line %q", scanner.Text())

				if frame["t"] == "screen" {
					var screen muxfx.ServerToFrontend

					require.NoError(t, json.Unmarshal(msg.Frame, &screen), "line %q", scanner.Text())
					painter.apply(screen.Screen)
				}

				if done(frame) {
					return
				}
			}
		}

		t.Fatalf("the daemon stopped sending before %s: %v; screen so far %q", what, scanner.Err(), painter.text())
	}

	send(`{"type":"mux","frame":{"t":"attach","viewport":{"cols":100,"rows":30}}}`)

	readUntil("a full scene with the first tab", func(frame map[string]any) bool {
		delta, _ := frame["delta"].(map[string]any)
		tabs, _ := delta["tabs"].([]any)

		return frame["t"] == "scene" && frame["full"] == true && len(tabs) == 1
	})

	// Replayed from the ledger or live, depending on when the pump ran.
	assert.Contains(t, stages, "starting")
	assert.Contains(t, stages, "ready")

	send(`{"type":"mux","frame":{"t":"action","action":{"type":"writeInput","data":"hello\r"}}}`)

	readUntil("the stand-in claude echoed the input", func(map[string]any) bool {
		return strings.Contains(painter.text(), "claude-got:s-mux:hello")
	})

	// stop ends a mux session, as stop_task did in the TypeScript worker.
	send(`{"type":"stop"}`)

	acceptCtx, cancel := context.WithTimeout(t.Context(), 2*muxWait)
	defer cancel()

	_, acceptErr := sess.AcceptBidiStream(acceptCtx)

	sessionErr, ok := errors.AsType[*wt.SessionError](acceptErr)
	require.True(t, ok, "AcceptBidiStream() after stop = %v, want a *webtransport.SessionError", acceptErr)
	assert.Equal(t, wt.SessionErrorCode(0), sessionErr.ErrorCode)
	assert.Equal(t, "session_ended", sessionErr.Message)

	f.waitForHandlerReturn(t)

	require.Eventually(t, func() bool { return len(f.srv.sessions.ListBySlug("proj")) == 0 },
		muxWait, 10*time.Millisecond, "the session is still registered")
}

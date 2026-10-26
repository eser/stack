// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !windows && !wasip1

package noskillsserverfx

import (
	"bufio"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/muxfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestMuxSessionSendsScreensOverWebTransport attaches to a kind=mux session
// over WebTransport, as mux_remote.js does: the client gets a full scene,
// then a full screen of the pane, then patches, and no other messages. Input sent as paste and key messages reaches the
// pane's program, a stand-in claude that echoes what it reads.
func TestMuxSessionSendsScreensOverWebTransport(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	bin := t.TempDir()
	writeScript(t, bin, "claude", `while read -r line; do printf 'claude-got:%s\n' "$line"; done
`)
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("SHELL", "/bin/sh")

	f := startAttachFixture(t)

	root := t.TempDir()
	require.NoError(t, f.srv.saveDaemonState(DaemonState{Projects: map[string]string{"proj": root}}))

	sess, err := f.client.ConnectWithHeaders(t.Context(), f.baseURL+"s-screen?kind=mux", f.headers)
	require.NoError(t, err, "attach")

	t.Cleanup(func() {
		_ = sess.Close() // the test is over either way
	})

	stream, err := sess.OpenBidiStreamSync(t.Context())
	require.NoError(t, err)
	require.NoError(t, stream.SetReadDeadline(time.Now().Add(2*muxWait)))

	send := func(frame string) {
		t.Helper()

		_, err := stream.Write([]byte(`{"type":"mux","frame":` + frame + "}\n"))
		require.NoError(t, err)
	}

	scanner := bufio.NewScanner(stream)
	scanner.Buffer(make([]byte, 0, 64*1024), 1<<22)

	var (
		pane    muxfx.PaneID
		painter = newScreenPainter()
		screens []bool // Full of each screen message of pane
		others  []muxfx.MessageType
		lastSeq int64
	)

	readUntil := func(what string, done func() bool) {
		t.Helper()

		for scanner.Scan() {
			var line remoteLine

			require.NoError(t, json.Unmarshal(scanner.Bytes(), &line), "line %q", scanner.Text())
			require.GreaterOrEqual(t, line.Seq, lastSeq, "line %q", scanner.Text())
			lastSeq = line.Seq

			if line.Type != "mux" {
				continue
			}

			require.Equal(t, 1, line.V)
			require.NotNil(t, line.Frame)

			switch line.Frame.T {
			case muxfx.MessageScene:
				if pane == "" && line.Frame.Delta != nil && line.Frame.Delta.FocusedPane != nil {
					pane = muxfx.PaneID(*line.Frame.Delta.FocusedPane)
				}
			case muxfx.MessageScreen:
				require.NotNil(t, line.Frame.Screen)

				if line.Frame.Pane == pane {
					screens = append(screens, line.Frame.Screen.Full)
					painter.apply(line.Frame.Screen)
				}
			case muxfx.MessageExit:
			default:
				others = append(others, line.Frame.T)
			}

			if done() {
				return
			}
		}

		t.Fatalf("the daemon stopped sending before %s: %v; screen so far %q", what, scanner.Err(), painter.text())
	}

	send(`{"t":"attach","viewport":{"cols":100,"rows":30}}`)

	readUntil("the pane's first screen", func() bool { return len(screens) > 0 })
	assert.True(t, screens[0], "the first screen of the pane is a full one")

	send(`{"t":"paste","paste":{"text":"hello"}}`)
	send(`{"t":"key","key":{"key":"Enter","code":"Enter"}}`)

	readUntil("the stand-in claude echoed the input", func() bool {
		return strings.Contains(painter.text(), "claude-got:hello")
	})

	assert.NotContains(t, screens[1:], true, "screens after the first are patches")
	assert.Empty(t, others, "messages besides scenes, screens and exit")
}

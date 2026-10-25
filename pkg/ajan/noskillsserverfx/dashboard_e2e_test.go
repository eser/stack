// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !windows && !wasip1

package noskillsserverfx

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/muxfx"
	"github.com/eser/stack/pkg/ajan/noskillsfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/net/websocket"
)

// browserTerminal is the browser side of the dashboard terminal, as
// static/client.js and mux-render.js drive it: it reads the token from the
// page, opens /mux with it and its page's Origin, attaches with its
// viewport, paints the screen messages and applies the
// scene, and sends actions and key, paste, mouse and focus input.
type browserTerminal struct {
	t     *testing.T
	conn  *websocket.Conn
	panes map[string]*screenPainter
	tabs  []any
}

// pageToken is the token in a dashboard page, read as client.js reads it.
func pageToken(t *testing.T, page string) string {
	t.Helper()

	match := regexp.MustCompile(`<meta name="noskills-token" content="([^"]+)" />`).FindStringSubmatch(page)
	require.NotNil(t, match, "the page carries no token")

	return match[1]
}

// openBrowserTerminal connects to /mux the way client.js does.
func openBrowserTerminal(t *testing.T, base, token string) *browserTerminal {
	t.Helper()

	wsURL := "ws" + strings.TrimPrefix(base, "http") + "/mux?token=" + url.QueryEscape(token)

	config, err := websocket.NewConfig(wsURL, base)
	require.NoError(t, err)

	conn, err := config.DialContext(t.Context())
	require.NoError(t, err)

	t.Cleanup(func() { _ = conn.Close() })

	return &browserTerminal{t: t, conn: conn, panes: map[string]*screenPainter{}, tabs: nil}
}

// send writes one frame, as client.js's send does.
func (b *browserTerminal) send(frame string) {
	b.t.Helper()

	require.NoError(b.t, websocket.Message.Send(b.conn, frame))
}

// typeText sends a key message per character, as mux-render.js does for
// each keydown.
func (b *browserTerminal) typeText(text string) {
	b.t.Helper()

	for _, r := range text {
		key, err := json.Marshal(map[string]any{"t": "key", "key": map[string]string{"key": string(r), "text": string(r)}})
		require.NoError(b.t, err)
		b.send(string(key))
	}
}

// painted is the text the browser shows of the only pane it painted: its
// history and its rows.
func (b *browserTerminal) painted() string {
	out := make([]string, 0, len(b.panes))

	for _, painter := range b.panes {
		out = append(out, painter.text())
	}

	return strings.Join(out, "\n")
}

// mouseMode is the mouse reporting the painted pane asked for.
func (b *browserTerminal) mouseMode() string {
	for _, painter := range b.panes {
		return painter.mouse
	}

	return ""
}

// next reads one frame and applies it.
func (b *browserTerminal) next() (map[string]any, error) {
	_ = b.conn.SetReadDeadline(time.Now().Add(muxWait))

	var text string
	if err := websocket.Message.Receive(b.conn, &text); err != nil {
		return nil, err //nolint:wrapcheck // the caller reports it
	}

	var frame map[string]any
	if err := json.Unmarshal([]byte(text), &frame); err != nil {
		return nil, err //nolint:wrapcheck // the caller reports it
	}

	switch frame["t"] {
	case "screen":
		var msg muxfx.ServerToFrontend
		if err := json.Unmarshal([]byte(text), &msg); err != nil {
			return nil, err //nolint:wrapcheck // the caller reports it
		}

		painter, ok := b.panes[string(msg.Pane)]
		if !ok {
			painter = newScreenPainter()
			b.panes[string(msg.Pane)] = painter
		}

		painter.apply(msg.Screen)
	case "scene":
		delta, _ := frame["delta"].(map[string]any)
		if tabs, ok := delta["tabs"].([]any); ok {
			b.tabs = tabs
		}
	case "exit":
	default:
		b.t.Errorf("a frame the protocol does not have: %s", text)
	}

	return frame, nil
}

// readUntil applies frames until done holds.
func (b *browserTerminal) readUntil(what string, done func(frame map[string]any) bool) {
	b.t.Helper()

	for {
		frame, err := b.next()
		require.NoError(b.t, err, "reading until %s; painted so far:\n%s", what, b.painted())

		if done(frame) {
			return
		}
	}
}

// browserFetch sends a mutating call as client.js's authedFetch does.
func browserFetch(t *testing.T, method, base, path, token, body string) map[string]any {
	t.Helper()

	request, err := http.NewRequestWithContext(t.Context(), method, base+path, strings.NewReader(body))
	require.NoError(t, err)

	request.Header.Set("Origin", base)
	request.Header.Set(DashboardTokenHeader, token)

	if method != http.MethodDelete {
		request.Header.Set("Content-Type", "application/json")
	}

	response, err := http.DefaultClient.Do(request)
	require.NoError(t, err)

	defer response.Body.Close() //nolint:errcheck // read below

	data, err := io.ReadAll(response.Body)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, response.StatusCode, string(data))

	var decoded map[string]any

	require.NoError(t, json.Unmarshal(data, &decoded))

	return decoded
}

// TestBrowserTerminalRunsAgainstTheGoMuxEndpoint runs the dashboard terminal
// end to end: a live dashboard on a free port, a coding agent stand-in on a
// real pseudo-terminal, and the frames client.js and mux-render.js exchange
// with /mux. The test plays the browser's part of the protocol and reads the
// rows the screen messages paint; browser_scripts.test.ts checks that
// mux-render.js sends and paints these frames.
func TestBrowserTerminalRunsAgainstTheGoMuxEndpoint(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	t.Parallel()

	// The stand-in turns on focus reports and SGR mouse reports, then prints
	// every line it reads with its control characters spelled out by sed.
	agent := writeScript(t, t.TempDir(), "claude",
		`printf '\033[?1004h\033[?1000h\033[?1006h'
while read -r line; do printf 'claude-got:%s:' "$NOSKILLS_SESSION"; printf '%s\n' "$line" | sed -n l; done
`)

	f := newDashboardFixture(t, func(config *DashboardConfig) {
		config.NewPtyHost = nil
		config.AgentCommand = func() string { return agent }
	})
	base := liveDashboard(t, f)

	status, page := liveRequest(t, http.MethodGet, base+"/", "", nil)
	require.Equal(t, http.StatusOK, status)

	token := pageToken(t, page)

	browser := openBrowserTerminal(t, base, token)

	// ws.onopen: attach with the viewport; the server answers with a full
	// scene of the empty multiplexer.
	browser.send(`{"t":"attach","viewport":{"cols":100,"rows":30}}`)
	browser.readUntil("the first full scene", func(frame map[string]any) bool {
		return frame["t"] == "scene" && frame["full"] == true
	})
	assert.Empty(t, browser.tabs)

	// The "+" button: POST /api/tab, and the scene shows the new tab.
	created := browserFetch(t, http.MethodPost, base, "/api/tab", token, "{}")
	tabID, _ := created["tabId"].(string)
	require.NotEmpty(t, tabID)

	browser.readUntil("a scene with the new tab", func(map[string]any) bool { return len(browser.tabs) == 1 })

	sessions := noskillsfx.ListSessions(f.root)
	require.Len(t, sessions, 1)

	got := "claude-got:" + sessions[0].ID + ":"

	// The stand-in's modes reach the browser in its screen.
	browser.readUntil("the pane's mouse mode", func(map[string]any) bool { return browser.mouseMode() == "vt200" })

	// Typing into the terminal: each keydown becomes a key message, and the
	// agent's answer is painted in the pane's rows.
	browser.typeText("hello")
	browser.send(`{"t":"key","key":{"key":"Enter","code":"Enter"}}`)
	browser.readUntil("the agent echoed the keys", func(map[string]any) bool {
		return strings.Contains(browser.painted(), got+"hello$")
	})

	// A paste and the Enter key; the server encodes them for the pane.
	browser.send(`{"t":"paste","paste":{"text":"pasted"}}`)
	browser.send(`{"t":"key","key":{"key":"Enter","code":"Enter"}}`)
	browser.readUntil("the agent echoed the paste", func(map[string]any) bool {
		return strings.Contains(browser.painted(), got+"pasted$")
	})

	// Focus and a click, which the program asked to have reported: the
	// server writes ESC [ I and an SGR mouse press to the pane.
	browser.send(`{"t":"focus","focus":{"focused":true}}`)
	browser.send(`{"t":"mouse","mouse":{"kind":"press","button":"left","row":2,"col":4}}`)
	browser.send(`{"t":"key","key":{"key":"Enter","code":"Enter"}}`)
	browser.readUntil("the agent read the focus and mouse reports", func(map[string]any) bool {
		return strings.Contains(browser.painted(), got+`\033[I\033[<0;5;3M$`)
	})

	// A window resize sends resize, which the server applies to the panes.
	browser.send(`{"t":"resize","viewport":{"cols":80,"rows":24}}`)
	browser.readUntil("a scene with the new viewport", func(frame map[string]any) bool {
		delta, _ := frame["delta"].(map[string]any)
		viewport, _ := delta["viewport"].(map[string]any)

		return frame["t"] == "scene" && viewport["cols"] == 80.0
	})

	// A second page takes the terminal over: the first socket is closed, and
	// the new one gets a full scene that still has the tab and the pane's
	// current screen, without the program writing again.
	second := openBrowserTerminal(t, base, token)
	second.send(`{"t":"attach","viewport":{"cols":100,"rows":30}}`)
	second.readUntil("a full scene for the second page", func(frame map[string]any) bool {
		return frame["t"] == "scene" && frame["full"] == true
	})
	assert.Len(t, second.tabs, 1)
	second.readUntil("the current screen for the second page", func(map[string]any) bool {
		return strings.Contains(second.painted(), got+"pasted$")
	})

	for {
		if _, err := browser.next(); err != nil {
			assert.True(t, errors.Is(err, io.EOF) || strings.Contains(err.Error(), "closed"), "the first socket ended with %v", err)

			break
		}
	}

	// The tab's close button: DELETE /api/tab/{id}, and the scene drops it.
	browserFetch(t, http.MethodDelete, base, "/api/tab/"+tabID, token, "")
	second.readUntil("a scene without the tab", func(map[string]any) bool { return len(second.tabs) == 0 })

	require.Eventually(t, func() bool { return len(noskillsfx.ListSessions(f.root)) == 0 },
		muxWait, 10*time.Millisecond, "the tab's session file is still there")
}

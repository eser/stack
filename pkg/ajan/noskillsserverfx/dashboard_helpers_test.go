// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsserverfx

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/eser/stack/pkg/ajan/muxfx"
	"github.com/eser/stack/pkg/ajan/noskillsfx"
	"github.com/stretchr/testify/require"
)

// dashboardTestToken is the token the test dashboards are built with.
const dashboardTestToken = "test-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

// fakePtyHost runs no process: it records what reaches the panes, so the tab
// tests check the API without a coding agent or a pseudo-terminal.
type fakePtyHost struct {
	mu        sync.Mutex
	writes    []string
	panes     map[muxfx.PaneID]bool
	order     []muxfx.PaneID
	callbacks muxfx.PtyHostCallbacks
}

func newFakePtyHost() *fakePtyHost {
	return &fakePtyHost{panes: map[muxfx.PaneID]bool{}} //nolint:exhaustruct
}

func (h *fakePtyHost) Spawn(req *muxfx.SpawnRequest) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	if !h.panes[req.Pane] {
		h.order = append(h.order, req.Pane)
	}

	h.panes[req.Pane] = true

	return nil
}

// connect keeps the server's callbacks, so output can be played into a pane.
func (h *fakePtyHost) connect(callbacks muxfx.PtyHostCallbacks) *fakePtyHost {
	h.mu.Lock()
	h.callbacks = callbacks
	h.mu.Unlock()

	return h
}

// output plays data as the output of pane's program.
func (h *fakePtyHost) output(pane muxfx.PaneID, data string) {
	h.mu.Lock()
	onData := h.callbacks.OnData
	h.mu.Unlock()

	if onData != nil {
		onData(pane, []byte(data))
	}
}

// onlyPane is the one pane spawned so far.
func (h *fakePtyHost) onlyPane(t *testing.T) muxfx.PaneID {
	t.Helper()

	h.mu.Lock()
	defer h.mu.Unlock()

	require.Len(t, h.order, 1, "spawned panes")

	return h.order[0]
}

func (h *fakePtyHost) Write(_ muxfx.PaneID, data []byte) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.writes = append(h.writes, string(data))

	return nil
}

func (h *fakePtyHost) Resize(muxfx.PaneID, int, int) error { return nil }
func (h *fakePtyHost) Kill(muxfx.PaneID)                   {}
func (h *fakePtyHost) Forget(muxfx.PaneID)                 {}
func (h *fakePtyHost) KillAll()                            {}

func (h *fakePtyHost) Has(pane muxfx.PaneID) bool {
	h.mu.Lock()
	defer h.mu.Unlock()

	return h.panes[pane]
}

func (h *fakePtyHost) written() []string {
	h.mu.Lock()
	defer h.mu.Unlock()

	return append([]string(nil), h.writes...)
}

// syncBuffer is a bytes.Buffer the server's goroutines can log into.
type syncBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *syncBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	return b.buf.Write(p) //nolint:wrapcheck // a test buffer
}

// records are the JSON log lines written so far.
func (b *syncBuffer) records(t *testing.T) []map[string]any {
	t.Helper()

	b.mu.Lock()
	text := b.buf.String()
	b.mu.Unlock()

	var records []map[string]any

	for line := range strings.Lines(text) {
		var record map[string]any

		require.NoError(t, json.Unmarshal([]byte(line), &record), "log line %q", line)
		records = append(records, record)
	}

	return records
}

func (b *syncBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()

	return b.buf.String()
}

// dashboardFixture is a dashboard of a fresh project, with a fake PTY host
// and a log the test can read.
type dashboardFixture struct {
	d    *Dashboard
	root string
	host *fakePtyHost
	logs *syncBuffer
}

// testLifecycleEnv resolves no identity, so the acting user is the one a
// request names or Unknown User.
func testLifecycleEnv(root string) *noskillsfx.LifecycleEnv {
	return &noskillsfx.LifecycleEnv{ //nolint:exhaustruct
		Root:      root,
		Cwd:       root,
		LookupEnv: func(string) (string, bool) { return "", false },
		Now:       time.Now,
	}
}

func newDashboardFixture(t *testing.T, configure ...func(config *DashboardConfig)) *dashboardFixture {
	t.Helper()

	root := t.TempDir()
	host := newFakePtyHost()
	logs := &syncBuffer{} //nolint:exhaustruct

	config := &DashboardConfig{
		Root:         root,
		Token:        dashboardTestToken,
		DebugErrors:  false,
		Env:          testLifecycleEnv(root),
		NewPtyHost:   func(callbacks muxfx.PtyHostCallbacks) muxfx.PtyHost { return host.connect(callbacks) },
		AgentCommand: func() string { return "claude" },
	}

	for _, change := range configure {
		change(config)
	}

	logger := logfx.NewLogger(logfx.WithWriter(logs), logfx.WithConfig(&logfx.Config{Level: "INFO"})) //nolint:exhaustruct

	d, err := NewDashboard(config, logger)
	require.NoError(t, err)

	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.WithoutCancel(t.Context()), muxDisposeTimeout)
		defer cancel()

		_ = d.Close(ctx) // closing twice is fine; the test is over
	})

	return &dashboardFixture{d: d, root: root, host: host, logs: logs}
}

// call sends a request through the dashboard's handler for port 3000.
func (f *dashboardFixture) call(t *testing.T, method, target, body string, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()

	var reader io.Reader
	if body != "" {
		reader = strings.NewReader(body)
	}

	request := httptest.NewRequestWithContext(t.Context(), method, target, reader)
	for name, value := range headers {
		request.Header.Set(name, value)
	}

	recorder := httptest.NewRecorder()
	f.d.Handler(DashboardDefaultPort).ServeHTTP(recorder, request)

	return recorder
}

// post sends a mutating JSON request with the token.
func (f *dashboardFixture) post(t *testing.T, target, body string) *httptest.ResponseRecorder {
	t.Helper()

	return f.call(t, http.MethodPost, target, body, map[string]string{
		"Content-Type": "application/json", DashboardTokenHeader: dashboardTestToken,
	})
}

// decode reads a JSON response.
func decode(t *testing.T, recorder *httptest.ResponseRecorder) map[string]any {
	t.Helper()

	var body map[string]any

	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body), "body %q", recorder.Body.String())

	return body
}

// writeSpecState writes a spec directory and its state in phase, as the
// lifecycle leaves a spec that reached it.
func writeSpecState(t *testing.T, root, name, phase string) {
	t.Helper()

	require.NoError(t, os.MkdirAll(filepath.Join(root, ".eser", "specs", name), 0o750))

	state := noskillsfx.InitialState()
	state.Set("phase", phase)
	state.Set("spec", name)
	state.Set("specDescription", "Test spec for "+name)

	require.NoError(t, noskillsfx.WriteSpecStateObject(root, name, state, nil))
}

// liveDashboard serves f's dashboard on a free port of 127.0.0.1 until the
// test ends, and returns its base URL.
func liveDashboard(t *testing.T, f *dashboardFixture) string {
	t.Helper()

	ctx, cancel := context.WithCancel(context.WithoutCancel(t.Context()))

	listener, err := ListenDashboard(ctx, 0)
	require.NoError(t, err)

	served := make(chan error, 1)

	go func() { served <- f.d.Serve(ctx, listener) }()

	t.Cleanup(func() {
		cancel()

		select {
		case err := <-served:
			require.NoError(t, err)
		case <-time.After(2 * muxDisposeTimeout):
			t.Error("Serve did not return after its context ended")
		}
	})

	port := listener.Addr().(*net.TCPAddr).Port //nolint:forcetypeassert // ListenDashboard listens on TCP

	return "http://127.0.0.1:" + strconv.Itoa(port)
}

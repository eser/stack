package noskillsserverfx_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/httpclient"
	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/eser/stack/pkg/ajan/noskillsserverfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel/trace"
)

func freeUDPPort(t *testing.T) string {
	t.Helper()

	conn, err := net.ListenPacket("udp", "127.0.0.1:0")
	require.NoError(t, err, "find free UDP port")

	addr := conn.LocalAddr().String()
	_ = conn.Close()

	return addr
}

func TestServer_Health_HTTP3(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	addr := freeUDPPort(t)

	config := &noskillsserverfx.ServerConfig{
		H3Addr:                  addr,
		DataDir:                 t.TempDir(), // the default is ~/.noskills
		SelfSigned:              true,
		GracefulShutdownTimeout: 2 * time.Second,
	}

	logger := logfx.NewLogger()
	srv := noskillsserverfx.New(config, logger)

	cleanup, err := srv.Start(ctx)
	require.NoError(t, err, "server start")

	defer cleanup()

	cert := srv.Cert()
	require.NotNil(t, cert, "cert must be set after Start")

	// Give the QUIC listener a moment to be ready.
	time.Sleep(50 * time.Millisecond)

	// Create an HTTP/3 client that pins by the self-signed cert fingerprint.
	rt := httpclient.NewHTTP3RoundTripper(
		httpclient.WithH3CertHashes([][]byte{cert.FingerprintBytes}),
	)

	httpClient := &http.Client{
		Transport: rt,
		Timeout:   5 * time.Second,
	}

	_, port, _ := net.SplitHostPort(addr)
	url := fmt.Sprintf("https://127.0.0.1:%s/api/health", port)

	resp, err := httpClient.Get(url)
	require.NoError(t, err, "GET /api/health")

	defer func() { _ = resp.Body.Close() }()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]any

	err = json.NewDecoder(resp.Body).Decode(&body)
	require.NoError(t, err, "decode response body")

	assert.Equal(t, "ok", body["status"])
	assert.Equal(t, noskillsserverfx.Version, body["version"])
}

func TestServer_CertFingerprint_HTTP3(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	addr := freeUDPPort(t)

	config := &noskillsserverfx.ServerConfig{
		H3Addr:                  addr,
		DataDir:                 t.TempDir(), // the default is ~/.noskills
		SelfSigned:              true,
		GracefulShutdownTimeout: 2 * time.Second,
	}

	logger := logfx.NewLogger()
	srv := noskillsserverfx.New(config, logger)

	cleanup, err := srv.Start(ctx)
	require.NoError(t, err)

	defer cleanup()

	cert := srv.Cert()
	require.NotNil(t, cert)

	time.Sleep(50 * time.Millisecond)

	rt := httpclient.NewHTTP3RoundTripper(
		httpclient.WithH3CertHashes([][]byte{cert.FingerprintBytes}),
	)

	httpClient := &http.Client{Transport: rt, Timeout: 5 * time.Second}

	_, port, _ := net.SplitHostPort(addr)
	url := fmt.Sprintf("https://127.0.0.1:%s/api/cert-fingerprint", port)

	resp, err := httpClient.Get(url)
	require.NoError(t, err)

	defer func() { _ = resp.Body.Close() }()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]any

	err = json.NewDecoder(resp.Body).Decode(&body)
	require.NoError(t, err)

	assert.Equal(t, cert.Fingerprint, body["fingerprint"])
	assert.Equal(t, "sha-256", body["algorithm"])
}

// TestServer_HandlerErrorsReachTheServerLogger pins where a handler's
// WithSanitizedError error is logged: once, by the router, through the logger
// the daemon was built with and with the request's trace id, not through
// slog's default logger. /api/cert-fingerprint answers 503 until Start has
// loaded the certificate, so the router is served without starting the daemon.
func TestServer_HandlerErrorsReachTheServerLogger(t *testing.T) {
	t.Parallel()

	var logs bytes.Buffer

	logger := logfx.NewLogger(
		logfx.WithWriter(&logs),
		logfx.WithConfig(&logfx.Config{Level: "INFO"}), //nolint:exhaustruct
	)
	srv := noskillsserverfx.New(&noskillsserverfx.ServerConfig{ //nolint:exhaustruct
		DataDir:    t.TempDir(),
		SelfSigned: true,
	}, logger)

	traceID := trace.TraceID{0x0b, 0x6e, 0x1c, 0x52, 0x9d, 0x3a, 0x41, 0x7f, 0x8c, 0x20, 0x5a, 0xe4, 0x91, 0x07, 0x3d, 0xc8}
	reqCtx := trace.ContextWithSpanContext(t.Context(), trace.NewSpanContext(trace.SpanContextConfig{
		TraceID:    traceID,
		SpanID:     trace.SpanID{0x5e, 0x11, 0xa2, 0x4b, 0x90, 0x0c, 0x7d, 0x36},
		TraceFlags: trace.FlagsSampled,
	}))

	recorder := httptest.NewRecorder()
	srv.Router().GetMux().ServeHTTP(recorder,
		httptest.NewRequestWithContext(reqCtx, http.MethodGet, "/api/cert-fingerprint", nil))

	assert.Equal(t, http.StatusServiceUnavailable, recorder.Code)
	assert.NotContains(t, recorder.Body.String(), "cert not yet initialised")

	var errorEntries []map[string]any

	for line := range strings.Lines(logs.String()) {
		var entry map[string]any

		require.NoError(t, json.Unmarshal([]byte(line), &entry), "log line %q", line)

		if entry["msg"] == "httpfx router: request error" {
			errorEntries = append(errorEntries, entry)
		}
	}

	require.Len(t, errorEntries, 1, "logged once: %s", logs.String())

	entry := errorEntries[0]
	assert.Equal(t, "ERROR", entry["level"])
	assert.Equal(t, traceID.String(), entry["trace_id"])
	assert.Equal(t, "GET /api/cert-fingerprint", entry["pattern"])

	loggedError, _ := entry["error"].(map[string]any)
	assert.Equal(t, "cert not yet initialised", loggedError["msg"])
}

package noskillsserverfx_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/httpclient"
	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/eser/stack/pkg/ajan/noskillsserverfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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

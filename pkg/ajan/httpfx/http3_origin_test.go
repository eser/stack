// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package httpfx_test

import (
	"crypto/sha256"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/eser/stack/pkg/ajan/webtransport"
	wt "github.com/quic-go/webtransport-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newOriginTestService builds an HTTP3Service that is never started, for
// tests that only call its upgrader.
func newOriginTestService(t *testing.T, allowedOrigins []string) *httpfx.HTTP3Service {
	t.Helper()

	logger := logfx.NewLogger(logfx.WithWriter(io.Discard))
	config := &httpfx.Config{ //nolint:exhaustruct
		H3ListenAddr:     "127.0.0.1:0",
		H3MaxStreams:     100,
		H3AllowedOrigins: allowedOrigins,
	}

	return httpfx.NewHTTP3Service(config, httpfx.NewRouter(logger), logger)
}

// The upgrader refuses a cross-origin request before anything else, so a
// plain request shows the origin decision: a refused origin returns
// ErrWebTransportOriginNotAllowed, and an accepted one fails later, because
// the request is not a real WebTransport CONNECT.
func TestWebTransportUpgrader_OriginCheck(t *testing.T) {
	t.Parallel()

	allowlist := []string{"https://app.example.com", "http://localhost:3000", "HTTPS://Upper.Example.com:443"}

	tests := []struct {
		name        string
		allowed     []string
		origin      string
		wantAllowed bool
	}{
		{name: "no Origin header", allowed: nil, origin: "", wantAllowed: true},
		{name: "same origin by default", allowed: nil, origin: "https://daemon.example:4433", wantAllowed: true},
		{name: "same origin, other letter case", allowed: nil, origin: "https://DAEMON.example:4433", wantAllowed: true},
		{name: "cross origin by default", allowed: nil, origin: "https://app.example.com", wantAllowed: false},
		{name: "listed origin", allowed: allowlist, origin: "https://app.example.com", wantAllowed: true},
		{name: "listed origin with its default port", allowed: allowlist, origin: "https://app.example.com:443", wantAllowed: true},
		{name: "listed origin with a port", allowed: allowlist, origin: "http://localhost:3000", wantAllowed: true},
		{name: "listed in other letter case", allowed: allowlist, origin: "https://upper.example.com", wantAllowed: true},
		{name: "listed host, other scheme", allowed: allowlist, origin: "http://app.example.com", wantAllowed: false},
		{name: "listed host, other port", allowed: allowlist, origin: "https://app.example.com:8443", wantAllowed: false},
		{name: "subdomain of a listed host", allowed: allowlist, origin: "https://evil.app.example.com", wantAllowed: false},
		{name: "listed host as a prefix", allowed: allowlist, origin: "https://app.example.com.evil.test", wantAllowed: false},
		{name: "opaque origin", allowed: allowlist, origin: "null", wantAllowed: false},
		{name: "origin with a path", allowed: allowlist, origin: "https://app.example.com/page", wantAllowed: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			service := newOriginTestService(t, tt.allowed)

			req := httptest.NewRequestWithContext(t.Context(), http.MethodConnect, "https://daemon.example:4433/attach", nil)
			req.Host = "daemon.example:4433" // httptest reads a CONNECT target as an authority, which leaves Host as "https:"

			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}

			_, err := service.Upgrader().Upgrade(httptest.NewRecorder(), req)
			require.Error(t, err, "a plain request never upgrades")

			refused := errors.Is(err, httpfx.ErrWebTransportOriginNotAllowed)
			assert.Equal(t, !tt.wantAllowed, refused, "Upgrade() with Origin %q = %v", tt.origin, err)
		})
	}
}

// An entry that is not an exact origin stops Start before it opens the
// socket, instead of being skipped or matched loosely.
func TestHTTP3Service_StartRejectsInvalidAllowedOrigins(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		origin string
	}{
		{name: "no scheme", origin: "app.example.com"},
		{name: "unsupported scheme", origin: "ftp://app.example.com"},
		{name: "trailing slash", origin: "https://app.example.com/"},
		{name: "path", origin: "https://app.example.com/app"},
		{name: "query", origin: "https://app.example.com?x=1"},
		{name: "user info", origin: "https://user@app.example.com"},
		{name: "wildcard", origin: "https://*.example.com"},
		{name: "invalid port", origin: "https://app.example.com:http"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			service := newOriginTestService(t, []string{"https://ok.example.com", tt.origin})

			cleanup, err := service.Start(t.Context())

			require.ErrorIs(t, err, httpfx.ErrHTTP3InvalidAllowedOrigin)
			assert.Contains(t, err.Error(), tt.origin, "the error names the entry")
			assert.Nil(t, cleanup)
		})
	}
}

// TestHTTP3Service_WebTransportAllowedOrigins dials a real HTTP/3 server
// with the Origin header a browser page sends: a listed cross-origin page
// upgrades, an unlisted one is refused with 403 before any session exists.
func TestHTTP3Service_WebTransportAllowedOrigins(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	t.Parallel()

	logger := logfx.NewLogger(logfx.WithWriter(io.Discard))
	router := httpfx.NewRouter(logger)

	config := &httpfx.Config{ //nolint:exhaustruct
		H3ListenAddr:            freeUDPAddr(t),
		H3MaxStreams:            100,
		H3AllowedOrigins:        []string{"https://app.example.com"},
		SelfSigned:              true,
		GracefulShutdownTimeout: 2 * time.Second,
	}
	service := httpfx.NewHTTP3Service(config, router, logger)

	router.RouteRaw("/attach", func(w http.ResponseWriter, r *http.Request) {
		sess, err := service.Upgrader().Upgrade(w, r)
		if errors.Is(err, httpfx.ErrWebTransportOriginNotAllowed) {
			http.Error(w, "origin not allowed", http.StatusForbidden)

			return
		}

		if err != nil {
			http.Error(w, "upgrade failed", http.StatusBadRequest)

			return
		}

		_ = sess.CloseWithError(7, "upgraded") // the client reads the close reason
	})

	require.NoError(t, service.SetupTLS(t.Context(), nil))

	cleanup, err := service.Start(t.Context())
	require.NoError(t, err)
	t.Cleanup(cleanup)

	leaf := sha256.Sum256(service.Server().TLSConfig.Certificates[0].Certificate[0])
	client, err := webtransport.NewClient(
		webtransport.WithCertHashes([][]byte{leaf[:]}),
		webtransport.WithDialTimeout(5*time.Second),
	)
	require.NoError(t, err)
	t.Cleanup(func() {
		_ = client.Close() // always nil
	})

	attachURL := "https://" + config.H3ListenAddr + "/attach"

	tests := []struct {
		name     string
		origin   string
		upgrades bool
	}{
		{name: "listed cross origin", origin: "https://app.example.com", upgrades: true},
		{name: "same origin", origin: "https://" + config.H3ListenAddr, upgrades: true},
		{name: "unlisted cross origin", origin: "https://evil.example.com", upgrades: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			sess, connectErr := client.ConnectWithHeaders(t.Context(), attachURL, http.Header{
				"Origin": []string{tt.origin},
			})

			if !tt.upgrades {
				require.Error(t, connectErr)
				assert.Contains(t, connectErr.Error(), "received status 403")

				return
			}

			require.NoError(t, connectErr)
			t.Cleanup(func() {
				_ = sess.Close() // the server has closed it already
			})

			_, acceptErr := sess.AcceptBidiStream(t.Context())

			sessionErr, ok := errors.AsType[*wt.SessionError](acceptErr)
			require.True(t, ok, "AcceptBidiStream() = %v, want a *webtransport.SessionError", acceptErr)
			assert.Equal(t, wt.SessionErrorCode(7), sessionErr.ErrorCode)
			assert.Equal(t, "upgraded", sessionErr.Message)
		})
	}
}

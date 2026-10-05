// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package httpfx_test

import (
	"crypto/sha256"
	"errors"
	"io"
	"net"
	"net/http"
	"sync/atomic"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/httpclient"
	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/httpfx/middlewares"
	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/eser/stack/pkg/ajan/webtransport"
	"github.com/golang-jwt/jwt/v5"
	wt "github.com/quic-go/webtransport-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const h3TestJWTSecret = "h3-test-secret"

func freeUDPAddr(t *testing.T) string {
	t.Helper()

	conn, err := net.ListenPacket("udp", "127.0.0.1:0")
	require.NoError(t, err, "find a free UDP port")

	addr := conn.LocalAddr().String()
	require.NoError(t, conn.Close())

	return addr
}

// TestHTTP3Service_WebTransportRawRoute serves a WebTransport upgrade on a raw
// route behind AuthMiddleware over real HTTP/3 and dials it with the
// webtransport client: a CONNECT without a token is refused before the raw
// handler runs, and one with a token upgrades with the claims in its context.
func TestHTTP3Service_WebTransportRawRoute(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	t.Parallel()

	logger := logfx.NewLogger(logfx.WithWriter(io.Discard))

	router := httpfx.NewRouter(logger)
	router.Use(middlewares.AuthMiddleware(logger, h3TestJWTSecret))

	config := &httpfx.Config{
		H3ListenAddr:            freeUDPAddr(t),
		H3MaxStreams:            100,
		SelfSigned:              true,
		GracefulShutdownTimeout: 2 * time.Second,
	}
	service := httpfx.NewHTTP3Service(config, router, logger)

	var rawCalls atomic.Int32

	router.RouteRaw("/attach/{sid}", func(w http.ResponseWriter, r *http.Request) {
		rawCalls.Add(1)

		sess, err := service.Upgrader().Upgrade(w, r)
		if err != nil {
			http.Error(w, "upgrade failed", http.StatusBadRequest)

			return
		}

		// Close with the token's subject, so the client sees which claims
		// reached the raw handler.
		claims, _ := r.Context().Value(middlewares.ContextKeyAuthClaims).(jwt.MapClaims)
		subject, _ := claims["sub"].(string)
		_ = sess.CloseWithError(7, subject) // the client reads the close reason
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

	attachURL := "https://" + config.H3ListenAddr + "/attach/s1"

	// The subtests run in order, not in parallel: the first one asserts that
	// the raw handler has not run yet.
	t.Run("without a token", func(t *testing.T) {
		_, connectErr := client.Connect(t.Context(), attachURL)

		require.Error(t, connectErr)
		assert.Contains(t, connectErr.Error(), "received status 401")
		assert.Equal(t, int32(0), rawCalls.Load(), "the raw handler does not run after a rejection")
	})

	t.Run("with a token", func(t *testing.T) {
		token, signErr := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub": "user-1",
			"exp": time.Now().Add(time.Hour).Unix(),
		}).SignedString([]byte(h3TestJWTSecret))
		require.NoError(t, signErr)

		sess, connectErr := client.ConnectWithHeaders(t.Context(), attachURL, http.Header{
			"Authorization": []string{"Bearer " + token},
		})
		require.NoError(t, connectErr)
		t.Cleanup(func() {
			_ = sess.Close() // the server has closed it already
		})

		_, acceptErr := sess.AcceptBidiStream(t.Context())

		sessionErr, ok := errors.AsType[*wt.SessionError](acceptErr)
		require.True(t, ok, "AcceptBidiStream() = %v, want a *webtransport.SessionError", acceptErr)
		assert.Equal(t, wt.SessionErrorCode(7), sessionErr.ErrorCode)
		assert.Equal(t, "user-1", sessionErr.Message)
		assert.Equal(t, int32(1), rawCalls.Load())
	})
}

// TestHTTP3Service_BodylessResult serves a 204 over real HTTP/3. quic-go's
// response writer refuses even a zero-byte body for a 204, so the router must
// not write the empty body, and its logger stays empty.
func TestHTTP3Service_BodylessResult(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	t.Parallel()

	var routerLogs lockedBuffer

	router := newLoggedRouter(&routerLogs, "DEBUG")
	router.Route("DELETE /items/{id}", func(ctx *httpfx.Context) httpfx.Result {
		return ctx.Results.Ok()
	})
	router.Route("GET /items/{id}", func(ctx *httpfx.Context) httpfx.Result {
		return ctx.Results.PlainText([]byte("item " + ctx.Request.PathValue("id")))
	})

	config := &httpfx.Config{
		H3ListenAddr:            freeUDPAddr(t),
		H3MaxStreams:            100,
		SelfSigned:              true,
		GracefulShutdownTimeout: 2 * time.Second,
	}
	service := httpfx.NewHTTP3Service(config, router, logfx.NewLogger(logfx.WithWriter(io.Discard)))

	require.NoError(t, service.SetupTLS(t.Context(), nil))

	cleanup, err := service.Start(t.Context())
	require.NoError(t, err)
	t.Cleanup(cleanup)

	leaf := sha256.Sum256(service.Server().TLSConfig.Certificates[0].Certificate[0])
	transport := httpclient.NewHTTP3RoundTripper(
		httpclient.WithH3CertHashes([][]byte{leaf[:]}),
		httpclient.WithH3DialTimeout(5*time.Second),
	)
	t.Cleanup(func() {
		if closer, ok := transport.(io.Closer); ok {
			_ = closer.Close() // closes idle QUIC connections; nothing to report
		}
	})

	client := &http.Client{Transport: transport, Timeout: 5 * time.Second} //nolint:exhaustruct

	tests := []struct {
		method     string
		wantStatus int
		wantBody   string
	}{
		{method: http.MethodDelete, wantStatus: http.StatusNoContent, wantBody: ""},
		{method: http.MethodGet, wantStatus: http.StatusOK, wantBody: "item 42"},
	}

	for _, tt := range tests {
		req, reqErr := http.NewRequestWithContext(t.Context(), tt.method, "https://"+config.H3ListenAddr+"/items/42", nil)
		require.NoError(t, reqErr)

		resp, doErr := client.Do(req)
		require.NoError(t, doErr, "%s /items/42", tt.method)

		// Reading to EOF waits for the handler to return, so anything it
		// logged is in routerLogs.
		body, readErr := io.ReadAll(resp.Body)
		require.NoError(t, readErr)
		require.NoError(t, resp.Body.Close())

		assert.Equal(t, tt.wantStatus, resp.StatusCode, "%s /items/42", tt.method)
		assert.Equal(t, tt.wantBody, string(body), "%s /items/42", tt.method)
	}

	assert.Empty(t, routerLogs.String(), "the router logs no write error")
}

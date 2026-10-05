// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package middlewares_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/httpfx/middlewares"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// These tests mount the middlewares in front of a RouteRaw handler, the way a
// WebTransport upgrade is served, and check that a rejection keeps the raw
// handler from running.

// rawAttach is a raw handler that records its calls and the claims the
// request carried when it ran.
type rawAttach struct {
	calls  int
	claims jwt.MapClaims
}

func (a *rawAttach) handle(w http.ResponseWriter, r *http.Request) {
	a.calls++
	a.claims, _ = r.Context().Value(middlewares.ContextKeyAuthClaims).(jwt.MapClaims)

	w.WriteHeader(http.StatusOK)
}

func newRawRouter(handlers ...httpfx.Handler) (*httpfx.Router, *rawAttach) {
	router := newTestRouter()
	router.Use(handlers...)

	attach := &rawAttach{}
	router.RouteRaw("/attach/{sid}", attach.handle)

	return router, attach
}

func serveConnect(t *testing.T, router *httpfx.Router, authorization string) *httptest.ResponseRecorder {
	t.Helper()

	req := httptest.NewRequestWithContext(t.Context(), http.MethodConnect, "/attach/s1", nil)
	req.Proto = "webtransport-h3"
	req.RemoteAddr = "203.0.113.7:4433"

	if authorization != "" {
		req.Header.Set("Authorization", authorization)
	}

	recorder := httptest.NewRecorder()
	router.GetMux().ServeHTTP(recorder, req)

	return recorder
}

func TestAuthMiddleware_RawRoute(t *testing.T) {
	t.Parallel()

	validToken := signToken(t, jwt.SigningMethodHS256, testJWTSecret, validClaims())
	expiredToken := signToken(t, jwt.SigningMethodHS256, testJWTSecret, withClaim("exp", 1))

	tests := []struct {
		name          string
		authorization string
		wantStatus    int
		wantBody      string
		wantCalls     int
	}{
		{
			name:       "no token",
			wantStatus: http.StatusUnauthorized,
			wantBody:   "No suitable authorization header found",
			wantCalls:  0,
		},
		{
			name:          "token signed with another secret",
			authorization: "Bearer " + signToken(t, jwt.SigningMethodHS256, "other", validClaims()),
			wantStatus:    http.StatusUnauthorized,
			wantBody:      "Invalid token",
			wantCalls:     0,
		},
		{
			name:          "expired token",
			authorization: "Bearer " + expiredToken,
			wantStatus:    http.StatusUnauthorized,
			wantBody:      "Token is expired",
			wantCalls:     0,
		},
		{
			name:          "valid token",
			authorization: "Bearer " + validToken,
			wantStatus:    http.StatusOK,
			wantBody:      "",
			wantCalls:     1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			var logs bytes.Buffer

			router, attach := newRawRouter(
				middlewares.AuthMiddleware(newTestLogger(&logs), testJWTSecret),
			)

			recorder := serveConnect(t, router, tt.authorization)

			assert.Equal(t, tt.wantStatus, recorder.Code)
			assert.Equal(t, tt.wantBody, recorder.Body.String())
			assert.Equal(t, tt.wantCalls, attach.calls)

			if tt.wantCalls > 0 {
				assert.Equal(t, "user-1", attach.claims["sub"], "claims reach the raw handler")
			}
		})
	}
}

func TestRateLimitMiddleware_RawRoute(t *testing.T) {
	t.Parallel()

	router, attach := newRawRouter(
		middlewares.RateLimitMiddleware(middlewares.WithRateLimiterRequestsPerMinute(1)),
	)

	first := serveConnect(t, router, "")
	assert.Equal(t, http.StatusOK, first.Code)
	assert.Equal(t, 1, attach.calls)

	second := serveConnect(t, router, "")
	assert.Equal(t, http.StatusTooManyRequests, second.Code)
	assert.Equal(t, 1, attach.calls, "the raw handler does not run past the limit")
	assert.Equal(t, httpfx.ContentTypeJSON, second.Header().Get("Content-Type"))
	assert.NotEmpty(t, second.Header().Get("Retry-After"))
	assert.Equal(t, "0", second.Header().Get("X-Ratelimit-Remaining"))

	var body map[string]any

	require.NoError(t, json.Unmarshal(second.Body.Bytes(), &body))
	assert.Equal(t, "Rate limit exceeded", body["error"])
}

func TestCorsMiddleware_RawRoutePreflight(t *testing.T) {
	t.Parallel()

	router, attach := newRawRouter(middlewares.CorsMiddleware())

	req := httptest.NewRequestWithContext(t.Context(), http.MethodOptions, "/attach/s1", nil)
	req.Header.Set("Origin", "https://app.example.test")

	recorder := httptest.NewRecorder()
	router.GetMux().ServeHTTP(recorder, req)

	assert.Equal(t, http.StatusNoContent, recorder.Code)
	assert.Equal(t, "*", recorder.Header().Get(middlewares.AccessControlAllowOriginHeader))
	assert.Equal(t, 0, attach.calls, "a preflight is answered by the middleware")
}

func TestErrorHandlerMiddleware_RawRoutePanickingMiddleware(t *testing.T) {
	t.Parallel()

	router, attach := newRawRouter(
		middlewares.ErrorHandlerMiddleware(),
		func(*httpfx.Context) httpfx.Result {
			panic("middleware failed")
		},
	)

	recorder := serveConnect(t, router, "")

	assert.Equal(t, http.StatusInternalServerError, recorder.Code)
	assert.NotContains(t, recorder.Body.String(), "middleware failed")
	assert.Equal(t, 0, attach.calls)
}

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsserverfx

import (
	"io"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// These are the tests of the TypeScript auth.test.ts and server-auth.test.ts:
// the guards on their own, then the attacks they exist for, refused on the
// wire by a live server.

func TestNewDashboardTokenMintsAFresh32ByteHexToken(t *testing.T) {
	t.Parallel()

	first, err := NewDashboardToken()
	require.NoError(t, err)

	second, err := NewDashboardToken()
	require.NoError(t, err)

	assert.Regexp(t, regexp.MustCompile(`^[0-9a-f]{64}$`), first)
	assert.NotEqual(t, first, second, "tokens must not repeat")
}

func TestTokenMatchesOnlyTheExactValue(t *testing.T) {
	t.Parallel()

	token, err := NewDashboardToken()
	require.NoError(t, err)

	cases := []struct {
		name     string
		supplied string
		want     bool
	}{
		{name: "the token", supplied: token, want: true},
		{name: "missing", supplied: "", want: false},
		{name: "a longer value", supplied: token + "x", want: false},
		{name: "a value of the same length", supplied: strings.Repeat("0", 64), want: false},
		{name: "a prefix", supplied: token[:63], want: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tc.want, tokenMatches(tc.supplied, token))
		})
	}

	assert.False(t, tokenMatches("", ""), "an empty expected token matches nothing")
}

func TestOriginAllowlistCoversTheThreeLoopbackSpellings(t *testing.T) {
	t.Parallel()

	origins := dashboardOrigins(3000)

	cases := []struct {
		origin string
		want   bool
	}{
		{origin: "http://localhost:3000", want: true},
		{origin: "http://127.0.0.1:3000", want: true},
		{origin: "http://[::1]:3000", want: true},
		// Foreign origins and other ports of the same host.
		{origin: "https://evil.example", want: false},
		{origin: "http://localhost:9999", want: false},
		{origin: "http://192.168.1.10:3000", want: false},
		{origin: "null", want: false},
		// A missing Origin passes: the token is what gates non-browsers.
		{origin: "", want: true},
	}

	for _, tc := range cases {
		t.Run(tc.origin, func(t *testing.T) {
			t.Parallel()

			request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/mux", nil)
			if tc.origin != "" {
				request.Header.Set("Origin", tc.origin)
			}

			assert.Equal(t, tc.want, originAllowed(request, origins))
		})
	}
}

func TestOnlyApplicationJSONPassesTheContentTypeGate(t *testing.T) {
	t.Parallel()

	cases := []struct {
		contentType string
		want        bool
	}{
		{contentType: "application/json", want: true},
		{contentType: "application/json; charset=utf-8", want: true},
		{contentType: "Application/JSON", want: true},
		// The three types an HTML form can post across origins without a
		// preflight.
		{contentType: "application/x-www-form-urlencoded", want: false},
		{contentType: "multipart/form-data", want: false},
		{contentType: "text/plain", want: false},
		{contentType: "", want: false},
	}

	for _, tc := range cases {
		t.Run(tc.contentType, func(t *testing.T) {
			t.Parallel()

			request := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/tab", strings.NewReader("{}"))
			request.Header.Set("Content-Type", tc.contentType)

			assert.Equal(t, tc.want, hasJSONContentType(request))
		})
	}
}

func TestGuardRefusesBeforeAnyRoute(t *testing.T) {
	t.Parallel()

	f := newDashboardFixture(t)

	cases := []struct {
		name    string
		method  string
		target  string
		headers map[string]string
		reason  string
	}{
		{
			name: "a mutating request from a foreign origin", method: http.MethodPost, target: "/api/tab",
			headers: map[string]string{"Origin": "https://evil.example", "Content-Type": "application/json", DashboardTokenHeader: dashboardTestToken},
			reason:  "origin not allowed",
		},
		{
			name: "a mutating request without JSON", method: http.MethodPost, target: "/api/tab",
			headers: map[string]string{"Content-Type": "text/plain", DashboardTokenHeader: dashboardTestToken},
			reason:  "expected application/json",
		},
		{
			name: "a mutating request without the token", method: http.MethodPost, target: "/api/tab",
			headers: map[string]string{"Content-Type": "application/json"}, reason: "missing or invalid token",
		},
		{
			name: "a DELETE without the token", method: http.MethodDelete, target: "/api/tab/tab-1",
			headers: map[string]string{}, reason: "missing or invalid token",
		},
		{
			name: "a mutating request to an unknown path", method: http.MethodPut, target: "/nowhere",
			headers: map[string]string{"Content-Type": "application/json"}, reason: "missing or invalid token",
		},
		{
			name: "/mux from a foreign origin", method: http.MethodGet, target: "/mux?token=" + dashboardTestToken,
			headers: map[string]string{"Origin": "https://evil.example", "Upgrade": "websocket"}, reason: "origin not allowed",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			recorder := f.call(t, tc.method, tc.target, "{}", tc.headers)

			assert.Equal(t, http.StatusForbidden, recorder.Code)
			assert.Equal(t, "Forbidden: "+tc.reason, recorder.Body.String())
		})
	}

	// A DELETE needs no JSON body, as in the TypeScript guard.
	closed := f.call(t, http.MethodDelete, "/api/tab/tab-1", "", map[string]string{DashboardTokenHeader: dashboardTestToken})
	assert.Equal(t, http.StatusOK, closed.Code)
}

func TestMuxWithoutAnUpgradeAnswers426(t *testing.T) {
	t.Parallel()

	f := newDashboardFixture(t)

	recorder := f.call(t, http.MethodGet, "/mux?token="+dashboardTestToken, "", nil)

	assert.Equal(t, http.StatusUpgradeRequired, recorder.Code)
	assert.Equal(t, "WebSocket upgrade required", recorder.Body.String())
}

// liveRequest sends a request to a live dashboard and returns the status and
// body.
func liveRequest(t *testing.T, method, url, body string, headers map[string]string) (int, string) {
	t.Helper()

	var reader io.Reader
	if body != "" {
		reader = strings.NewReader(body)
	}

	request, err := http.NewRequestWithContext(t.Context(), method, url, reader)
	require.NoError(t, err)

	for name, value := range headers {
		request.Header.Set(name, value)
	}

	response, err := http.DefaultClient.Do(request)
	require.NoError(t, err)

	defer response.Body.Close() //nolint:errcheck // read below

	data, err := io.ReadAll(response.Body)
	require.NoError(t, err)

	return response.StatusCode, string(data)
}

func TestLiveDashboardRefusesTheAttacks(t *testing.T) {
	t.Parallel()

	f := newDashboardFixture(t)
	base := liveDashboard(t, f)

	t.Run("a /mux upgrade without a token", func(t *testing.T) {
		status, _ := liveRequest(t, http.MethodGet, base+"/mux", "", map[string]string{"Upgrade": "websocket", "Connection": "Upgrade"})
		assert.Equal(t, http.StatusForbidden, status)
	})

	t.Run("a /mux upgrade from a foreign Origin, even with the token", func(t *testing.T) {
		status, _ := liveRequest(t, http.MethodGet, base+"/mux?token="+dashboardTestToken, "",
			map[string]string{"Upgrade": "websocket", "Connection": "Upgrade", "Origin": "https://evil.example"})
		assert.Equal(t, http.StatusForbidden, status)
	})

	t.Run("POST /api/tab without a token", func(t *testing.T) {
		status, _ := liveRequest(t, http.MethodPost, base+"/api/tab", "{}", map[string]string{"Content-Type": "application/json"})
		assert.Equal(t, http.StatusForbidden, status)
	})

	t.Run("a POST with a form content type", func(t *testing.T) {
		status, _ := liveRequest(t, http.MethodPost, base+"/api/tab", "a=1", map[string]string{
			"Content-Type": "application/x-www-form-urlencoded", DashboardTokenHeader: dashboardTestToken,
		})
		assert.Equal(t, http.StatusForbidden, status)
	})

	t.Run("the server's own Origin passes on the port the system picked", func(t *testing.T) {
		status, body := liveRequest(t, http.MethodPost, base+"/api/spec/any-spec/no-such-action", "{}", map[string]string{
			"Origin": base, "Content-Type": "application/json", DashboardTokenHeader: dashboardTestToken,
		})
		assert.Equal(t, http.StatusBadRequest, status)
		assert.JSONEq(t, `{"ok":false,"error":"Unknown action: no-such-action"}`, body)
	})

	t.Run("a JSON body that is not an object reads as {}", func(t *testing.T) {
		status, body := liveRequest(t, http.MethodPost, base+"/api/spec/any-spec/no-such-action", "null", map[string]string{
			"Content-Type": "application/json", DashboardTokenHeader: dashboardTestToken,
		})
		assert.Equal(t, http.StatusBadRequest, status)
		assert.JSONEq(t, `{"ok":false,"error":"Unknown action: no-such-action"}`, body)
	})

	t.Run("the dashboard serves and hands the browser its token", func(t *testing.T) {
		status, html := liveRequest(t, http.MethodGet, base+"/", "", nil)
		assert.Equal(t, http.StatusOK, status)
		assert.Contains(t, html, `<meta name="noskills-token" content="`+dashboardTestToken+`" />`)
	})
}

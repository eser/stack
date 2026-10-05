package middlewares_test

import (
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/httpfx/middlewares"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const wantHSTS = "max-age=31536000; includeSubDomains"

func serveWithSecurityHeaders(
	t *testing.T,
	req *http.Request,
	options ...middlewares.SecurityHeadersOption,
) http.Header {
	t.Helper()

	router := newTestRouter()
	router.Use(middlewares.SecurityHeadersMiddleware(options...))

	router.Route(req.Method+" /test", func(c *httpfx.Context) httpfx.Result {
		return c.Results.Ok()
	})

	responseRecorder := httptest.NewRecorder()
	router.GetMux().ServeHTTP(responseRecorder, req)

	return responseRecorder.Header()
}

func TestSecurityHeadersMiddlewareDefaults(t *testing.T) {
	t.Parallel()

	for _, method := range []string{http.MethodGet, http.MethodPost} {
		t.Run(method, func(t *testing.T) {
			t.Parallel()

			req := httptest.NewRequestWithContext(t.Context(), method, "https://example.test/test", nil)
			headers := serveWithSecurityHeaders(t, req)

			assert.Equal(t, "nosniff", headers.Get("X-Content-Type-Options"))
			assert.Equal(t, "DENY", headers.Get("X-Frame-Options"))
			assert.Equal(t, "strict-origin-when-cross-origin", headers.Get("Referrer-Policy"))
			assert.Equal(t, middlewares.DefaultPermissionsPolicy, headers.Get("Permissions-Policy"))
			assert.Contains(t, headers.Get("Permissions-Policy"), "camera=()")
			assert.Contains(t, headers.Get("Permissions-Policy"), "microphone=()")
			assert.Contains(t, headers.Get("Permissions-Policy"), "geolocation=()")
		})
	}
}

func TestSecurityHeadersMiddlewareOverrides(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name            string
		options         []middlewares.SecurityHeadersOption
		wantReferrer    string
		wantPermissions string
	}{
		{
			name:            "custom referrer policy",
			options:         []middlewares.SecurityHeadersOption{middlewares.WithReferrerPolicy("no-referrer")},
			wantReferrer:    "no-referrer",
			wantPermissions: middlewares.DefaultPermissionsPolicy,
		},
		{
			name: "custom permissions policy",
			options: []middlewares.SecurityHeadersOption{
				middlewares.WithPermissionsPolicy("camera=(self), microphone=()"),
			},
			wantReferrer:    middlewares.DefaultReferrerPolicy,
			wantPermissions: "camera=(self), microphone=()",
		},
		{
			name: "empty policies omit both headers",
			options: []middlewares.SecurityHeadersOption{
				middlewares.WithReferrerPolicy(""),
				middlewares.WithPermissionsPolicy(""),
			},
			wantReferrer:    "",
			wantPermissions: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/test", nil)
			headers := serveWithSecurityHeaders(t, req, tt.options...)

			assert.Equal(t, tt.wantReferrer, headers.Get("Referrer-Policy"))
			assert.Equal(t, tt.wantPermissions, headers.Get("Permissions-Policy"))

			_, hasReferrer := headers["Referrer-Policy"]
			assert.Equal(t, tt.wantReferrer != "", hasReferrer)
		})
	}
}

func TestSecurityHeadersMiddlewareHSTS(t *testing.T) { //nolint:funlen // one table of cases
	t.Parallel()

	proxies, err := httpfx.NewTrustedProxies([]string{"10.0.0.0/8"})
	require.NoError(t, err)

	withProxies := []middlewares.SecurityHeadersOption{
		middlewares.WithSecurityHeadersTrustedProxies(proxies),
	}

	tests := []struct {
		name       string
		options    []middlewares.SecurityHeadersOption
		remoteAddr string
		tls        bool
		proto      string
		wantHSTS   bool
	}{
		{
			name:       "plain HTTP",
			remoteAddr: "192.0.2.1:1234",
			wantHSTS:   false,
		},
		{
			name:       "TLS connection",
			remoteAddr: "192.0.2.1:1234",
			tls:        true,
			wantHSTS:   true,
		},
		{
			name:       "forwarded proto without a trusted proxy list",
			remoteAddr: "10.0.0.5:1234",
			proto:      "https",
			wantHSTS:   false,
		},
		{
			name:       "forwarded proto from an untrusted peer",
			options:    withProxies,
			remoteAddr: "192.0.2.1:1234",
			proto:      "https",
			wantHSTS:   false,
		},
		{
			name:       "forwarded https from a trusted proxy",
			options:    withProxies,
			remoteAddr: "10.0.0.5:1234",
			proto:      "https",
			wantHSTS:   true,
		},
		{
			name:       "forwarded http from a trusted proxy",
			options:    withProxies,
			remoteAddr: "10.0.0.5:1234",
			proto:      "http",
			wantHSTS:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "http://example.test/test", nil)
			req.RemoteAddr = tt.remoteAddr

			if tt.tls {
				req.TLS = &tls.ConnectionState{} //nolint:exhaustruct
			}

			if tt.proto != "" {
				req.Header.Set("X-Forwarded-Proto", tt.proto)
			}

			headers := serveWithSecurityHeaders(t, req, tt.options...)

			if tt.wantHSTS {
				assert.Equal(t, wantHSTS, headers.Get("Strict-Transport-Security"))

				return
			}

			assert.Empty(t, headers.Get("Strict-Transport-Security"))
		})
	}
}

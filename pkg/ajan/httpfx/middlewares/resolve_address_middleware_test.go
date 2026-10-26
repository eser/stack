package middlewares_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/httpfx/middlewares"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel/trace"
)

func TestResolveAddressMiddleware(t *testing.T) { //nolint:funlen
	t.Parallel()

	tests := []struct {
		name           string
		remoteAddr     string
		trustedProxies []string
		headers        map[string]string
		expectedOrigin string
		expectedAddr   string
		expectedStatus int
	}{
		{ //nolint:exhaustruct
			name:           "local_request",
			remoteAddr:     "127.0.0.1:12345",
			expectedOrigin: "local",
			expectedAddr:   "127.0.0.1:12345",
			expectedStatus: http.StatusNoContent,
		},
		{ //nolint:exhaustruct
			name:           "remote_request",
			remoteAddr:     "203.0.113.1:54321",
			expectedOrigin: "remote",
			expectedAddr:   "203.0.113.1:54321",
			expectedStatus: http.StatusNoContent,
		},
		{ //nolint:exhaustruct
			name:       "untrusted_peer_ignores_x_forwarded_for",
			remoteAddr: "10.0.0.1:54321",
			headers: map[string]string{
				"X-Forwarded-For": "203.0.113.1",
			},
			expectedOrigin: "remote",
			expectedAddr:   "10.0.0.1:54321",
			expectedStatus: http.StatusNoContent,
		},
		{ //nolint:exhaustruct
			name:       "untrusted_peer_ignores_true_client_ip",
			remoteAddr: "10.0.0.1:54321",
			headers: map[string]string{
				"True-Client-IP": "203.0.113.2",
				"X-Real-IP":      "203.0.113.3",
			},
			expectedOrigin: "remote",
			expectedAddr:   "10.0.0.1:54321",
			expectedStatus: http.StatusNoContent,
		},
		{ //nolint:exhaustruct
			name:       "untrusted_peer_cannot_forge_loopback",
			remoteAddr: "203.0.113.1:54321",
			headers: map[string]string{
				"X-Forwarded-For": "127.0.0.1",
			},
			expectedOrigin: "remote",
			expectedAddr:   "203.0.113.1:54321",
			expectedStatus: http.StatusNoContent,
		},
		{
			name:           "trusted_peer_honours_x_forwarded_for",
			remoteAddr:     "10.0.0.1:54321",
			trustedProxies: []string{"10.0.0.0/8"},
			headers: map[string]string{
				"X-Forwarded-For": "203.0.113.1",
			},
			expectedOrigin: "remote",
			expectedAddr:   "203.0.113.1",
			expectedStatus: http.StatusNoContent,
		},
		{
			name:           "trusted_peer_walks_right_to_left",
			remoteAddr:     "10.0.0.1:54321",
			trustedProxies: []string{"10.0.0.0/8"},
			headers: map[string]string{
				"X-Forwarded-For": "203.0.113.4, 10.0.0.2",
			},
			expectedOrigin: "remote",
			expectedAddr:   "203.0.113.4",
			expectedStatus: http.StatusNoContent,
		},
		{
			name:           "trusted_peer_honours_ipv6_forwarded_for",
			remoteAddr:     "10.0.0.1:54321",
			trustedProxies: []string{"10.0.0.0/8"},
			headers: map[string]string{
				"X-Forwarded-For": "2001:db8::1",
			},
			expectedOrigin: "remote",
			expectedAddr:   "2001:db8::1",
			expectedStatus: http.StatusNoContent,
		},
		{
			name:           "trusted_peer_honours_ipv6_loopback_forwarded_for",
			remoteAddr:     "10.0.0.1:54321",
			trustedProxies: []string{"10.0.0.0/8"},
			headers: map[string]string{
				"X-Forwarded-For": "::1",
			},
			expectedOrigin: "local",
			expectedAddr:   "::1",
			expectedStatus: http.StatusNoContent,
		},
		{
			name:           "trusted_peer_falls_back_to_x_real_ip",
			remoteAddr:     "10.0.0.1:54321",
			trustedProxies: []string{"10.0.0.0/8"},
			headers: map[string]string{
				"X-Real-IP": "203.0.113.3",
			},
			expectedOrigin: "remote",
			expectedAddr:   "203.0.113.3",
			expectedStatus: http.StatusNoContent,
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			trustedProxies, err := httpfx.NewTrustedProxies(tt.trustedProxies)
			require.NoError(t, err)

			var logs bytes.Buffer

			// Create a router with the resolve address middleware
			router := newTestRouter()
			router.Use(middlewares.ResolveAddressMiddleware(
				newTestLogger(&logs),
				middlewares.WithTrustedProxies(trustedProxies),
			))

			// Add a test route that returns the client address from context
			router.Route("GET /test", func(c *httpfx.Context) httpfx.Result {
				addr := c.Request.Context().Value(middlewares.ClientAddr).(string)         //nolint:forcetypeassert
				origin := c.Request.Context().Value(middlewares.ClientAddrOrigin).(string) //nolint:forcetypeassert

				assert.Equal(t, tt.expectedAddr, addr)
				assert.Equal(t, tt.expectedOrigin, origin)

				return c.Results.Ok()
			})

			// Create test request
			req := httptest.NewRequest(http.MethodGet, "/test", nil)
			req.RemoteAddr = tt.remoteAddr

			// Add headers
			for key, value := range tt.headers {
				req.Header.Set(key, value)
			}

			// Execute request
			responseRecorder := httptest.NewRecorder()
			router.GetMux().ServeHTTP(responseRecorder, req)

			// Verify response
			assert.Equal(t, tt.expectedStatus, responseRecorder.Code)

			if tt.expectedOrigin == "local" {
				assert.Equal(
					t,
					"local: "+tt.expectedAddr,
					responseRecorder.Header().Get("X-Request-Origin"),
				)
			} else {
				assert.Equal(t, tt.expectedAddr, responseRecorder.Header().Get("X-Request-Origin"))
			}
		})
	}
}

// An address the middleware cannot classify is answered with a bare 500. The
// address and the parser's message stay out of the response and are logged
// once, with the request's trace id.
func TestResolveAddressMiddleware_UnparsableAddress(t *testing.T) {
	t.Parallel()

	traceID := trace.TraceID{0x4b, 0xf9, 0x2f, 0x35, 0x77, 0xb3, 0x4d, 0xa6, 0xa3, 0xce, 0x92, 0x9d, 0x0e, 0x0e, 0x47, 0x36}
	spanID := trace.SpanID{0x00, 0xf0, 0x67, 0xaa, 0x0b, 0xa9, 0x02, 0xb7}

	tests := []struct {
		name       string
		remoteAddr string
		wantInLog  string
	}{
		{
			name:       "not an ip",
			remoteAddr: "peer.example.test",
			wantInLog:  "invalid IP address",
		},
		{
			name:       "not a host and port",
			remoteAddr: "203.0.113.1:80:90",
			wantInLog:  "failed to split host and port",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			var logs bytes.Buffer

			router := newTestRouter()
			router.Use(middlewares.ResolveAddressMiddleware(newTestLogger(&logs)))

			handlerCalls := 0

			router.Route("GET /test", func(c *httpfx.Context) httpfx.Result {
				handlerCalls++

				return c.Results.Ok()
			})

			reqCtx := trace.ContextWithSpanContext(t.Context(), trace.NewSpanContext(trace.SpanContextConfig{
				TraceID:    traceID,
				SpanID:     spanID,
				TraceFlags: trace.FlagsSampled,
			}))

			req := httptest.NewRequestWithContext(reqCtx, http.MethodGet, "/test", nil)
			req.RemoteAddr = tt.remoteAddr

			recorder := httptest.NewRecorder()
			router.GetMux().ServeHTTP(recorder, req)

			assert.Equal(t, http.StatusInternalServerError, recorder.Code)
			assert.Equal(t, http.StatusText(http.StatusInternalServerError), recorder.Body.String())
			assert.NotContains(t, recorder.Body.String(), tt.remoteAddr)
			assert.Empty(t, recorder.Header().Get("X-Request-Origin"))
			assert.Equal(t, 0, handlerCalls)

			logged := logs.String()
			assert.Equal(t, 1, strings.Count(logged, "classify client address"), "logged once: %s", logged)
			assert.Contains(t, logged, tt.wantInLog)
			assert.Contains(t, logged, tt.remoteAddr)
			assert.Contains(t, logged, traceID.String())
		})
	}
}

func TestGetClientAddrs(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		remoteAddr   string
		headers      map[string]string
		expectedAddr string
	}{
		{ //nolint:exhaustruct
			name:         "remote_addr_only",
			remoteAddr:   "203.0.113.1:54321",
			expectedAddr: "203.0.113.1:54321",
		},
		{
			name:       "x_forwarded_for_is_ignored",
			remoteAddr: "10.0.0.1:54321",
			headers: map[string]string{
				"X-Forwarded-For": "203.0.113.1",
			},
			expectedAddr: "10.0.0.1:54321",
		},
		{
			name:       "true_client_ip_is_ignored",
			remoteAddr: "10.0.0.1:54321",
			headers: map[string]string{
				"True-Client-IP": "203.0.113.2",
				"X-Real-IP":      "203.0.113.3",
			},
			expectedAddr: "10.0.0.1:54321",
		},
		{
			name:       "proxy_chain_is_ignored",
			remoteAddr: "10.0.0.1:54321",
			headers: map[string]string{
				"X-Forwarded-For": "203.0.113.4, 10.0.0.2",
			},
			expectedAddr: "10.0.0.1:54321",
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			// Create test request
			req := httptest.NewRequest(http.MethodGet, "/test", nil)
			req.RemoteAddr = tt.remoteAddr

			// Add headers
			for key, value := range tt.headers {
				req.Header.Set(key, value)
			}

			// Get client address
			addr := middlewares.GetClientAddrs(req)
			assert.Equal(t, tt.expectedAddr, addr)
		})
	}
}

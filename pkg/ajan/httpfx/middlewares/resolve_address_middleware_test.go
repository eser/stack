package middlewares_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/httpfx/middlewares"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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

			// Create a router with the resolve address middleware
			router := httpfx.NewRouter("/")
			router.Use(middlewares.ResolveAddressMiddleware(
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

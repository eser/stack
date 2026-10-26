package noskillsserverfx

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestServerResolveClientIP(t *testing.T) { //nolint:funlen
	t.Parallel()

	tests := []struct {
		name           string
		trustedProxies []string
		remoteAddr     string
		headers        map[string]string
		want           string
	}{
		{
			name:           "empty_allowlist_ignores_forwarded_headers",
			trustedProxies: nil,
			remoteAddr:     "203.0.113.9:41234",
			headers: map[string]string{
				"X-Forwarded-For": "1.2.3.4",
				"X-Real-IP":       "5.6.7.8",
			},
			want: "203.0.113.9",
		},
		{
			name:           "untrusted_peer_cannot_forge_its_bucket",
			trustedProxies: []string{"10.0.0.0/8"},
			remoteAddr:     "203.0.113.9:41234",
			headers: map[string]string{
				"X-Forwarded-For": "1.2.3.4",
			},
			want: "203.0.113.9",
		},
		{
			name:           "trusted_peer_resolves_rightmost_untrusted_hop",
			trustedProxies: []string{"10.0.0.0/8"},
			remoteAddr:     "10.0.0.1:41234",
			headers: map[string]string{
				"X-Forwarded-For": "9.9.9.9, 203.0.113.7",
			},
			want: "203.0.113.7",
		},
		{
			name:           "trusted_peer_without_headers_uses_socket",
			trustedProxies: []string{"10.0.0.0/8"},
			remoteAddr:     "10.0.0.1:41234",
			headers:        nil,
			want:           "10.0.0.1",
		},
		{
			name:           "loopback_peer_cannot_be_impersonated",
			trustedProxies: nil,
			remoteAddr:     "192.168.1.44:41234",
			headers: map[string]string{
				"X-Forwarded-For": "127.0.0.1",
			},
			want: "192.168.1.44",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			trustedProxies, err := httpfx.NewTrustedProxies(tt.trustedProxies)
			require.NoError(t, err)

			server := &Server{trustedProxies: trustedProxies} //nolint:exhaustruct

			req := httptest.NewRequest(http.MethodPost, "/auth/login", nil)
			req.RemoteAddr = tt.remoteAddr

			for key, value := range tt.headers {
				req.Header.Set(key, value)
			}

			ctx := &httpfx.Context{ //nolint:exhaustruct
				Request:        req,
				ResponseWriter: httptest.NewRecorder(),
				Results:        httpfx.Results{},
			}

			assert.Equal(t, tt.want, server.resolveClientIP(ctx))
		})
	}
}

// The lockout keys on resolveClientIP, so a caller rotating X-Forwarded-For must
// keep landing in the same bucket and still trip the threshold.
func TestServerResolveClientIPRotatingHeaderKeepsLockoutBucket(t *testing.T) {
	t.Parallel()

	server := &Server{trustedProxies: nil} //nolint:exhaustruct

	manager := &AuthManager{ //nolint:exhaustruct
		attempts: make(map[string]*ipAttempts),
	}

	for i := range lockoutThreshold {
		req := httptest.NewRequest(http.MethodPost, "/auth/login", nil)
		req.RemoteAddr = "203.0.113.9:41234"
		req.Header.Set("X-Forwarded-For", fmt.Sprintf("198.51.100.%d", i+1))

		ctx := &httpfx.Context{ //nolint:exhaustruct
			Request:        req,
			ResponseWriter: httptest.NewRecorder(),
			Results:        httpfx.Results{},
		}

		manager.attemptRecord(server.resolveClientIP(ctx)).totalFails++
	}

	assert.Len(t, manager.attempts, 1)
	assert.Equal(t, lockoutThreshold, manager.attempts["203.0.113.9"].totalFails)
}

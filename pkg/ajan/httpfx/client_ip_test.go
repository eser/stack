package httpfx_test

import (
	"net"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewTrustedProxies(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		entries   []string
		probe     string
		wantErr   bool
		wantTrust bool
		wantEmpty bool
	}{
		{
			name:      "nil_entries_trust_nobody",
			entries:   nil,
			probe:     "127.0.0.1",
			wantErr:   false,
			wantTrust: false,
			wantEmpty: true,
		},
		{
			name:      "blank_entries_are_skipped",
			entries:   []string{"", "   "},
			probe:     "127.0.0.1",
			wantErr:   false,
			wantTrust: false,
			wantEmpty: true,
		},
		{
			name:      "cidr_block_matches",
			entries:   []string{"10.0.0.0/8"},
			probe:     "10.4.5.6",
			wantErr:   false,
			wantTrust: true,
			wantEmpty: false,
		},
		{
			name:      "cidr_block_rejects_outsider",
			entries:   []string{"10.0.0.0/8"},
			probe:     "203.0.113.9",
			wantErr:   false,
			wantTrust: false,
			wantEmpty: false,
		},
		{
			name:      "single_address_matches_itself",
			entries:   []string{"192.168.1.5"},
			probe:     "192.168.1.5",
			wantErr:   false,
			wantTrust: true,
			wantEmpty: false,
		},
		{
			name:      "single_address_rejects_neighbour",
			entries:   []string{"192.168.1.5"},
			probe:     "192.168.1.6",
			wantErr:   false,
			wantTrust: false,
			wantEmpty: false,
		},
		{
			name:      "ipv6_cidr_matches",
			entries:   []string{"::1/128"},
			probe:     "::1",
			wantErr:   false,
			wantTrust: true,
			wantEmpty: false,
		},
		{
			name:      "invalid_entry_is_rejected",
			entries:   []string{"not-an-address"},
			probe:     "",
			wantErr:   true,
			wantTrust: false,
			wantEmpty: false,
		},
		{
			name:      "invalid_mask_is_rejected",
			entries:   []string{"10.0.0.0/64"},
			probe:     "",
			wantErr:   true,
			wantTrust: false,
			wantEmpty: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			trustedProxies, err := httpfx.NewTrustedProxies(tt.entries)

			if tt.wantErr {
				require.ErrorIs(t, err, httpfx.ErrInvalidTrustedProxy)

				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.wantEmpty, trustedProxies.IsEmpty())
			assert.Equal(t, tt.wantTrust, trustedProxies.Contains(net.ParseIP(tt.probe)))
		})
	}
}

func TestTrustedProxiesNilReceiver(t *testing.T) {
	t.Parallel()

	var trustedProxies *httpfx.TrustedProxies

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.RemoteAddr = "203.0.113.9:41234"
	req.Header.Set(httpfx.XForwardedForHeader, "1.2.3.4")

	assert.True(t, trustedProxies.IsEmpty())
	assert.False(t, trustedProxies.Contains(net.ParseIP("203.0.113.9")))
	assert.Equal(t, "203.0.113.9", trustedProxies.ClientIP(req))
	assert.Equal(t, "203.0.113.9:41234", trustedProxies.ClientAddr(req))
}

func TestTrustedProxiesClientIP(t *testing.T) { //nolint:funlen
	t.Parallel()

	tests := []struct {
		name       string
		trusted    []string
		remoteAddr string
		headers    map[string][]string
		wantIP     string
		wantAddr   string
	}{
		{
			name:       "empty_allowlist_ignores_forwarded_headers",
			trusted:    nil,
			remoteAddr: "203.0.113.9:41234",
			headers: map[string][]string{
				httpfx.XForwardedForHeader: {"1.2.3.4"},
				httpfx.XRealIPHeader:       {"5.6.7.8"},
				httpfx.TrueClientIPHeader:  {"9.10.11.12"},
			},
			wantIP:   "203.0.113.9",
			wantAddr: "203.0.113.9:41234",
		},
		{
			name:       "untrusted_peer_forwarded_headers_are_ignored",
			trusted:    []string{"10.0.0.0/8"},
			remoteAddr: "203.0.113.9:41234",
			headers: map[string][]string{
				httpfx.XForwardedForHeader: {"1.2.3.4"},
				httpfx.XRealIPHeader:       {"5.6.7.8"},
				httpfx.TrueClientIPHeader:  {"9.10.11.12"},
			},
			wantIP:   "203.0.113.9",
			wantAddr: "203.0.113.9:41234",
		},
		{
			name:       "trusted_peer_takes_rightmost_untrusted_hop",
			trusted:    []string{"10.0.0.0/8"},
			remoteAddr: "10.0.0.1:41234",
			headers: map[string][]string{
				httpfx.XForwardedForHeader: {"9.9.9.9, 203.0.113.7"},
			},
			wantIP:   "203.0.113.7",
			wantAddr: "203.0.113.7",
		},
		{
			name:       "trusted_peer_walks_past_trusted_hops",
			trusted:    []string{"10.0.0.0/8"},
			remoteAddr: "10.0.0.1:41234",
			headers: map[string][]string{
				httpfx.XForwardedForHeader: {"198.51.100.5, 10.0.0.9, 10.0.0.8"},
			},
			wantIP:   "198.51.100.5",
			wantAddr: "198.51.100.5",
		},
		{
			name:       "trusted_peer_spans_multiple_header_lines",
			trusted:    []string{"10.0.0.0/8"},
			remoteAddr: "10.0.0.1:41234",
			headers: map[string][]string{
				httpfx.XForwardedForHeader: {"198.51.100.5", "10.0.0.9, 10.0.0.8"},
			},
			wantIP:   "198.51.100.5",
			wantAddr: "198.51.100.5",
		},
		{
			name:       "all_hops_trusted_falls_back_to_outermost",
			trusted:    []string{"10.0.0.0/8"},
			remoteAddr: "10.0.0.1:41234",
			headers: map[string][]string{
				httpfx.XForwardedForHeader: {"10.0.0.5, 10.0.0.6"},
			},
			wantIP:   "10.0.0.5",
			wantAddr: "10.0.0.5",
		},
		{
			name:       "forwarded_hop_with_port_is_normalized",
			trusted:    []string{"10.0.0.0/8"},
			remoteAddr: "10.0.0.1:41234",
			headers: map[string][]string{
				httpfx.XForwardedForHeader: {"203.0.113.7:9999"},
			},
			wantIP:   "203.0.113.7",
			wantAddr: "203.0.113.7",
		},
		{
			name:       "unparseable_hops_are_discarded",
			trusted:    []string{"10.0.0.0/8"},
			remoteAddr: "10.0.0.1:41234",
			headers: map[string][]string{
				httpfx.XForwardedForHeader: {"not-an-ip, 203.0.113.7, junk"},
			},
			wantIP:   "203.0.113.7",
			wantAddr: "203.0.113.7",
		},
		{
			name:       "true_client_ip_only_after_empty_forwarded_for",
			trusted:    []string{"10.0.0.0/8"},
			remoteAddr: "10.0.0.1:41234",
			headers: map[string][]string{
				httpfx.TrueClientIPHeader: {"198.51.100.20"},
				httpfx.XRealIPHeader:      {"198.51.100.21"},
			},
			wantIP:   "198.51.100.20",
			wantAddr: "198.51.100.20",
		},
		{
			name:       "x_real_ip_is_last_resort",
			trusted:    []string{"10.0.0.0/8"},
			remoteAddr: "10.0.0.1:41234",
			headers: map[string][]string{
				httpfx.XRealIPHeader: {"198.51.100.21"},
			},
			wantIP:   "198.51.100.21",
			wantAddr: "198.51.100.21",
		},
		{
			name:       "trusted_peer_without_headers_uses_socket",
			trusted:    []string{"10.0.0.0/8"},
			remoteAddr: "10.0.0.1:41234",
			headers:    nil,
			wantIP:     "10.0.0.1",
			wantAddr:   "10.0.0.1:41234",
		},
		{
			name:       "ipv6_peer_is_unbracketed",
			trusted:    nil,
			remoteAddr: "[2001:db8::1]:41234",
			headers:    nil,
			wantIP:     "2001:db8::1",
			wantAddr:   "[2001:db8::1]:41234",
		},
		{
			name:       "ipv6_trusted_peer_honours_forwarded_for",
			trusted:    []string{"::1/128"},
			remoteAddr: "[::1]:41234",
			headers: map[string][]string{
				httpfx.XForwardedForHeader: {"2001:db8::9"},
			},
			wantIP:   "2001:db8::9",
			wantAddr: "2001:db8::9",
		},
		{
			name:       "remote_addr_without_port_still_resolves",
			trusted:    nil,
			remoteAddr: "203.0.113.9",
			headers:    nil,
			wantIP:     "203.0.113.9",
			wantAddr:   "203.0.113.9",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			trustedProxies, err := httpfx.NewTrustedProxies(tt.trusted)
			require.NoError(t, err)

			req := httptest.NewRequest(http.MethodGet, "/test", nil)
			req.RemoteAddr = tt.remoteAddr

			for key, values := range tt.headers {
				for _, value := range values {
					req.Header.Add(key, value)
				}
			}

			assert.Equal(t, tt.wantIP, trustedProxies.ClientIP(req))
			assert.Equal(t, tt.wantAddr, trustedProxies.ClientAddr(req))
		})
	}
}

// A caller that rotates X-Forwarded-For must not receive a fresh rate-limit
// bucket: every request from the same socket peer resolves to the same key.
func TestTrustedProxiesRotatingForwardedForKeepsOneKey(t *testing.T) {
	t.Parallel()

	trustedProxies, err := httpfx.NewTrustedProxies(nil)
	require.NoError(t, err)

	spoofed := []string{"1.1.1.1", "2.2.2.2", "3.3.3.3", "4.4.4.4"}
	seen := make(map[string]struct{})

	for _, value := range spoofed {
		req := httptest.NewRequest(http.MethodGet, "/auth/login", nil)
		req.RemoteAddr = "203.0.113.9:41234"
		req.Header.Set(httpfx.XForwardedForHeader, value)

		seen[trustedProxies.ClientIP(req)] = struct{}{}
	}

	assert.Len(t, seen, 1)
	assert.Contains(t, seen, "203.0.113.9")
}

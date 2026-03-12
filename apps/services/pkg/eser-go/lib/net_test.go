package lib_test

import (
	"testing"

	"github.com/eser/stack/apps/services/pkg/eser-go/lib"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIsPrivateIP(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		ip      string
		private bool
	}{
		// Private IPv4 ranges
		{name: "rfc1918_10", ip: "10.0.0.1", private: true},
		{name: "rfc1918_10_deep", ip: "10.255.255.255", private: true},
		{name: "rfc1918_172", ip: "172.16.0.1", private: true},
		{name: "rfc1918_172_end", ip: "172.31.255.255", private: true},
		{name: "rfc1918_192", ip: "192.168.1.1", private: true},
		{name: "loopback", ip: "127.0.0.1", private: true},
		{name: "loopback_other", ip: "127.255.255.255", private: true},
		{name: "link_local", ip: "169.254.1.1", private: true},
		{name: "unspecified", ip: "0.0.0.0", private: true},
		{name: "shared_addr_space", ip: "100.64.0.1", private: true},

		// Public IPv4
		{name: "public_1", ip: "8.8.8.8", private: false},
		{name: "public_2", ip: "203.0.113.1", private: false},
		{name: "public_172_outside", ip: "172.32.0.1", private: false},
		{name: "public_100_outside", ip: "100.128.0.1", private: false},

		// IPv6
		{name: "ipv6_loopback", ip: "::1", private: true},
		{name: "ipv6_unique_local", ip: "fd00::1", private: true},
		{name: "ipv6_link_local", ip: "fe80::1", private: true},
		{name: "ipv6_public", ip: "2001:db8::1", private: false},

		// Invalid
		{name: "invalid", ip: "not-an-ip", private: false},
		{name: "empty", ip: "", private: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			assert.Equal(t, tt.private, lib.IsPrivateIP(tt.ip))
		})
	}
}

func TestDetectLocalNetwork(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		addr      string
		wantLocal bool
		wantErr   bool
	}{
		{ //nolint:exhaustruct
			name:      "loopback_ipv4",
			addr:      "127.0.0.1",
			wantLocal: true,
		},
		{ //nolint:exhaustruct
			name:      "loopback_ipv4_with_port",
			addr:      "127.0.0.1:8080",
			wantLocal: true,
		},
		{ //nolint:exhaustruct
			name:      "remote_ipv4",
			addr:      "203.0.113.1",
			wantLocal: false,
		},
		{ //nolint:exhaustruct
			name:      "remote_ipv4_with_port",
			addr:      "203.0.113.1:8080",
			wantLocal: false,
		},
		{ //nolint:exhaustruct
			name:    "invalid_addr",
			addr:    "not-an-ip",
			wantErr: true,
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			isLocal, err := lib.DetectLocalNetwork(tt.addr)
			if tt.wantErr {
				require.Error(t, err)
				assert.ErrorIs(t, err, lib.ErrInvalidIPAddress)

				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.wantLocal, isLocal)
		})
	}
}

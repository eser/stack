package webtransport_test

import (
	"crypto/tls"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/webtransport"
)

func TestNewClientReportsInvalidOptions(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		opt      webtransport.Option
		wantPart string
	}{
		{
			name:     "negative dial timeout",
			opt:      webtransport.WithDialTimeout(-time.Second),
			wantPart: "dial timeout -1s is negative",
		},
		{
			name:     "cert hash shorter than SHA-256",
			opt:      webtransport.WithCertHashes([][]byte{make([]byte, 32), make([]byte, 20)}),
			wantPart: "cert hash 1 is 20 bytes, want 32",
		},
		{
			name:     "empty cert hash",
			opt:      webtransport.WithCertHashes([][]byte{{}}),
			wantPart: "cert hash 0 is 0 bytes, want 32",
		},
		{
			name: "TLS config capped below TLS 1.3",
			opt: webtransport.WithTLSClientConfig(&tls.Config{ //nolint:gosec // G402: the TLS 1.2 cap is the invalid value under test
				MinVersion: tls.VersionTLS12,
				MaxVersion: tls.VersionTLS12,
			}),
			wantPart: "MaxVersion TLS 1.2 is below TLS 1.3",
		},
		{
			name:     "full config with a negative dial timeout",
			opt:      webtransport.WithConfig(&webtransport.Config{DialTimeout: -time.Millisecond}),
			wantPart: "dial timeout -1ms is negative",
		},
		{
			name: "full config with a malformed cert hash",
			opt: webtransport.WithConfig(&webtransport.Config{
				CertHashes: [][]byte{make([]byte, 33)},
			}),
			wantPart: "cert hash 0 is 33 bytes, want 32",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			client, err := webtransport.NewClient(tc.opt)
			if client != nil {
				_ = client.Close() // always nil; the assertion below already fails
				t.Error("NewClient() returned a client for an invalid option")
			}

			if !errors.Is(err, webtransport.ErrInvalidOption) {
				t.Fatalf("NewClient() error = %v, want ErrInvalidOption", err)
			}

			if !strings.Contains(err.Error(), tc.wantPart) {
				t.Errorf("NewClient() error = %q, want it to contain %q", err, tc.wantPart)
			}
		})
	}
}

func TestNewClientAcceptsValidOptions(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		opts []webtransport.Option
	}{
		{name: "no options", opts: nil},
		{name: "zero dial timeout keeps the default", opts: []webtransport.Option{
			webtransport.WithDialTimeout(0),
		}},
		{name: "SHA-256 pin", opts: []webtransport.Option{
			webtransport.WithCertHashes([][]byte{make([]byte, 32)}),
		}},
		{name: "TLS config without a version cap", opts: []webtransport.Option{
			webtransport.WithTLSClientConfig(&tls.Config{MinVersion: tls.VersionTLS12}),
		}},
		{name: "nil TLS config", opts: []webtransport.Option{
			webtransport.WithTLSClientConfig(nil),
		}},
		{name: "full config", opts: []webtransport.Option{
			webtransport.WithConfig(&webtransport.Config{
				TLSConfig:   &tls.Config{MaxVersion: tls.VersionTLS13},
				CertHashes:  [][]byte{make([]byte, 32)},
				DialTimeout: time.Second,
			}),
		}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			client, err := webtransport.NewClient(tc.opts...)
			if err != nil {
				t.Fatalf("NewClient() = %v, want nil", err)
			}

			if closeErr := client.Close(); closeErr != nil {
				t.Errorf("Close() = %v, want nil", closeErr)
			}
		})
	}
}

// TestWithConfigCopiesTheCallersConfig pins that options applied after
// WithConfig change the client's copy, not the struct the caller passed in.
func TestWithConfigCopiesTheCallersConfig(t *testing.T) {
	t.Parallel()

	cfg := &webtransport.Config{DialTimeout: time.Second}

	client, err := webtransport.NewClient(
		webtransport.WithConfig(cfg),
		webtransport.WithDialTimeout(2*time.Second),
		webtransport.WithCertHashes([][]byte{make([]byte, 32)}),
	)
	if err != nil {
		t.Fatalf("NewClient() = %v", err)
	}

	defer client.Close() //nolint:errcheck // always nil

	if cfg.DialTimeout != time.Second || cfg.CertHashes != nil {
		t.Errorf("caller's config = (%s, %d hashes), want (1s, 0 hashes) unchanged",
			cfg.DialTimeout, len(cfg.CertHashes))
	}
}

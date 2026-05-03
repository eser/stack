package httpclient

import (
	"bytes"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net/http"
	"time"

	"github.com/quic-go/quic-go"
	"github.com/quic-go/quic-go/http3"
)

// h3RoundTripperConfig holds options for NewHTTP3RoundTripper.
type h3RoundTripperConfig struct {
	// TLSConfig is used as the base TLS configuration. When CertHashes is set,
	// VerifyPeerCertificate is injected automatically.
	TLSConfig *tls.Config

	// CertHashes is a list of SHA-256 DER fingerprints. When non-empty, the
	// transport pins the server certificate to these hashes instead of
	// performing normal CA chain validation (InsecureSkipVerify is set internally).
	// This mirrors the browser WebTransport serverCertificateHashes API.
	CertHashes [][]byte

	// DialTimeout caps the QUIC connection establishment time. Zero means no cap.
	DialTimeout time.Duration
}

// H3Option configures NewHTTP3RoundTripper.
type H3Option func(*h3RoundTripperConfig)

// WithH3TLSClientConfig sets a base tls.Config for the HTTP/3 transport.
// If CertHashes are also provided, this config is cloned and patched with
// InsecureSkipVerify + VerifyPeerCertificate.
func WithH3TLSClientConfig(cfg *tls.Config) H3Option {
	return func(c *h3RoundTripperConfig) {
		c.TLSConfig = cfg
	}
}

// WithH3CertHashes pins the connection to the supplied list of SHA-256 DER
// certificate fingerprints. Any server cert whose SHA-256(DER) matches one of
// the hashes is accepted, regardless of CA chain. Use for self-signed
// noskills-server certs in development; the daemon exposes the fingerprint at
// GET /api/cert-fingerprint.
func WithH3CertHashes(hashes [][]byte) H3Option {
	return func(c *h3RoundTripperConfig) {
		c.CertHashes = hashes
	}
}

// WithH3DialTimeout sets a maximum duration for QUIC connection establishment.
func WithH3DialTimeout(d time.Duration) H3Option {
	return func(c *h3RoundTripperConfig) {
		c.DialTimeout = d
	}
}

// NewHTTP3RoundTripper returns an http.RoundTripper backed by quic-go's
// http3.Transport. Drop it into any existing httpclient.Client via
// httpclient.WithRoundTripper so retry, circuit-breaker, and timeout logic
// all apply unchanged over HTTP/3.
//
// Example:
//
//	client := httpclient.NewClient(
//	    httpclient.WithRoundTripper(
//	        httpclient.NewHTTP3RoundTripper(
//	            httpclient.WithH3CertHashes(fingerprints),
//	        ),
//	    ),
//	)
func NewHTTP3RoundTripper(opts ...H3Option) http.RoundTripper {
	cfg := &h3RoundTripperConfig{}

	for _, o := range opts {
		o(cfg)
	}

	tlsCfg := buildH3TLSConfig(cfg)

	quicCfg := &quic.Config{} //nolint:exhaustruct
	if cfg.DialTimeout > 0 {
		quicCfg.HandshakeIdleTimeout = cfg.DialTimeout
	}

	return &http3.Transport{ //nolint:exhaustruct
		TLSClientConfig: tlsCfg,
		QUICConfig:      quicCfg,
	}
}

// buildH3TLSConfig builds the effective tls.Config for the transport.
// When CertHashes are specified, it clones cfg.TLSConfig (or starts fresh)
// and injects the hash-based VerifyPeerCertificate callback.
func buildH3TLSConfig(cfg *h3RoundTripperConfig) *tls.Config {
	if len(cfg.CertHashes) == 0 {
		if cfg.TLSConfig != nil {
			return cfg.TLSConfig
		}

		return &tls.Config{MinVersion: tls.VersionTLS13} //nolint:exhaustruct
	}

	var base *tls.Config
	if cfg.TLSConfig != nil {
		base = cfg.TLSConfig.Clone()
	} else {
		base = &tls.Config{MinVersion: tls.VersionTLS13} //nolint:exhaustruct
	}

	// Enforce TLS 1.3 — QUIC mandates it.
	if base.MinVersion < tls.VersionTLS13 {
		base.MinVersion = tls.VersionTLS13
	}

	// Skip CA chain validation; we pin by raw cert hash instead.
	base.InsecureSkipVerify = true //nolint:gosec

	// Capture hashes for the closure.
	pinnedHashes := make([][]byte, len(cfg.CertHashes))
	for i, h := range cfg.CertHashes {
		pinnedHashes[i] = bytes.Clone(h)
	}

	base.VerifyPeerCertificate = func(rawCerts [][]byte, _ [][]*x509.Certificate) error { //nolint:gosec // G123: QUIC short-lived conns, self-signed cert; VerifyConnection hardening is Phase 6
		for _, raw := range rawCerts {
			sum := sha256.Sum256(raw)

			for _, pinned := range pinnedHashes {
				if bytes.Equal(sum[:], pinned) {
					return nil
				}
			}
		}

		return fmt.Errorf("httpclient H3: no certificate matched the pinned fingerprints") //nolint:err113
	}

	return base
}

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
	// transport pins the server's leaf certificate to these hashes instead of
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
// certificate fingerprints. The connection is accepted only when the server's
// leaf certificate — not any other entry in the chain it presents — hashes to
// one of them, regardless of CA chain. Use for self-signed noskills-server
// certs in development; the daemon exposes the fingerprint at
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
// and injects the leaf-hash VerifyPeerCertificate callback. With no CertHashes
// the caller's config is returned untouched, so the default path keeps full CA
// chain and hostname verification.
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

	// Verification is replaced here, not dropped. A self-signed daemon cert has no
	// chain to build and no CA that will vouch for it, so the built-in verifier can
	// only ever reject it; InsecureSkipVerify is how Go lets us substitute our own
	// check. crypto/tls still invokes VerifyPeerCertificate when this flag is set,
	// and the callback below fails closed. Pinning the exact leaf is a tighter bind
	// than the hostname check it displaces: it accepts one specific key, not every
	// cert any trusted CA is willing to issue for the name.
	base.InsecureSkipVerify = true //nolint:gosec // G402: see above — pinning substitutes for chain validation.

	// Capture hashes for the closure.
	pinnedHashes := make([][]byte, len(cfg.CertHashes))
	for i, h := range cfg.CertHashes {
		pinnedHashes[i] = bytes.Clone(h)
	}

	base.VerifyPeerCertificate = func(rawCerts [][]byte, _ [][]*x509.Certificate) error {
		// Hash rawCerts[0] only. It is the end-entity cert whose private key signed
		// the handshake; every later entry is unauthenticated filler the peer chose
		// and proves nothing. Scanning the whole chain was a full MITM: an attacker
		// terminates the connection with its own leaf, appends the genuine daemon
		// cert as a bogus "intermediate", and the pin matches at index 1. That cert
		// is public — the daemon publishes its fingerprint at GET /api/cert-fingerprint
		// and hands the DER to anyone who completes a handshake — so the forged
		// chain costs an attacker nothing to assemble.
		if len(rawCerts) == 0 {
			return fmt.Errorf("httpclient H3: server presented no certificate") //nolint:err113
		}

		sum := sha256.Sum256(rawCerts[0])

		for _, pinned := range pinnedHashes {
			if bytes.Equal(sum[:], pinned) {
				return nil
			}
		}

		return fmt.Errorf("httpclient H3: leaf certificate matched none of the pinned fingerprints") //nolint:err113
	}

	// VerifyPeerCertificate is NOT called when a session is resumed, so pinning
	// that lives only there is bypassed by any peer that can present a valid
	// session ticket -- gosec G123. VerifyConnection runs on both fresh and
	// resumed handshakes, so the same leaf pin is enforced here too. Checking in
	// both places is deliberate: VerifyPeerCertificate rejects a bad chain before
	// the handshake completes, and this catches the resumption path.
	base.VerifyConnection = func(cs tls.ConnectionState) error {
		if len(cs.PeerCertificates) == 0 {
			return fmt.Errorf("httpclient H3: connection presented no certificate") //nolint:err113
		}

		sum := sha256.Sum256(cs.PeerCertificates[0].Raw)

		for _, pinned := range pinnedHashes {
			if bytes.Equal(sum[:], pinned) {
				return nil
			}
		}

		return fmt.Errorf("httpclient H3: resumed session leaf matched none of the pinned fingerprints") //nolint:err113
	}

	return base
}

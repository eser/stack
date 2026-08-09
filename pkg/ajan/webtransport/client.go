package webtransport

import (
	"bytes"
	"context"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net/http"

	"github.com/quic-go/quic-go"
	"github.com/quic-go/webtransport-go"
)

// Client dials WebTransport sessions. It is safe for concurrent use.
// Create one per logical endpoint; sessions are created via Connect.
type Client struct {
	config *Config
	dialer *webtransport.Transport
}

// NewClient creates a Client with the supplied options. The underlying QUIC
// dialer is initialised lazily on the first Connect call.
func NewClient(opts ...Option) *Client {
	c := &Client{
		config: &Config{},
	}

	for _, o := range opts {
		o(c)
	}

	tlsCfg := buildDialerTLSConfig(c.config)

	quicCfg := &quic.Config{ //nolint:exhaustruct
		EnableDatagrams:                  true,
		EnableStreamResetPartialDelivery: true,
	}

	if c.config.DialTimeout > 0 {
		quicCfg.HandshakeIdleTimeout = c.config.DialTimeout
	}

	c.dialer = &webtransport.Transport{ //nolint:exhaustruct
		TLSClientConfig: tlsCfg,
		QUICConfig:      quicCfg,
	}

	return c
}

// Connect dials the given WebTransport URL and returns a Session. The caller
// is responsible for calling Session.Close when done.
func (c *Client) Connect(ctx context.Context, url string) (*Session, error) {
	return c.ConnectWithHeaders(ctx, url, nil)
}

// ConnectWithHeaders dials with additional request headers (e.g. for token auth
// via ?token= query param or a custom header).
func (c *Client) ConnectWithHeaders(ctx context.Context, url string, headers http.Header) (*Session, error) {
	_, sess, err := c.dialer.Dial(ctx, url, headers)
	if err != nil {
		return nil, fmt.Errorf("webtransport dial %s: %w", url, err)
	}

	return &Session{inner: sess}, nil
}

// Close tears down the underlying QUIC transport. Any in-flight Connect calls
// will return with an error.
func (c *Client) Close() error {
	return c.dialer.Close()
}

// buildDialerTLSConfig constructs the effective tls.Config for the Dialer.
// When CertHashes are provided, InsecureSkipVerify + VerifyPeerCertificate
// are injected so a self-signed development cert is accepted when — and only
// when — its leaf fingerprint matches a supplied hash.
func buildDialerTLSConfig(cfg *Config) *tls.Config {
	if len(cfg.CertHashes) == 0 {
		base := cfg.TLSConfig
		if base == nil {
			base = &tls.Config{MinVersion: tls.VersionTLS13} //nolint:exhaustruct
		}

		return base
	}

	var base *tls.Config
	if cfg.TLSConfig != nil {
		base = cfg.TLSConfig.Clone()
	} else {
		base = &tls.Config{MinVersion: tls.VersionTLS13} //nolint:exhaustruct
	}

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
			return fmt.Errorf("webtransport: server presented no certificate") //nolint:err113
		}

		sum := sha256.Sum256(rawCerts[0])

		for _, pinned := range pinnedHashes {
			if bytes.Equal(sum[:], pinned) {
				return nil
			}
		}

		return fmt.Errorf("webtransport: leaf certificate matched none of the pinned fingerprints") //nolint:err113
	}

	// VerifyPeerCertificate is NOT called when a session is resumed, so pinning
	// that lives only there is bypassed by any peer that can present a valid
	// session ticket -- gosec G123. VerifyConnection runs on both fresh and
	// resumed handshakes, so the same leaf pin is enforced here too. Checking in
	// both places is deliberate: VerifyPeerCertificate rejects a bad chain before
	// the handshake completes, and this catches the resumption path.
	base.VerifyConnection = func(cs tls.ConnectionState) error {
		if len(cs.PeerCertificates) == 0 {
			return fmt.Errorf("webtransport: connection presented no certificate") //nolint:err113
		}

		sum := sha256.Sum256(cs.PeerCertificates[0].Raw)

		for _, pinned := range pinnedHashes {
			if bytes.Equal(sum[:], pinned) {
				return nil
			}
		}

		return fmt.Errorf("webtransport: resumed session leaf matched none of the pinned fingerprints") //nolint:err113
	}

	return base
}

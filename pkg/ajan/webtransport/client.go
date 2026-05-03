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
	dialer *webtransport.Dialer
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

	c.dialer = &webtransport.Dialer{ //nolint:exhaustruct
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
// are injected so self-signed development certs are accepted by fingerprint.
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

	base.InsecureSkipVerify = true //nolint:gosec

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

		return fmt.Errorf("webtransport: no certificate matched the pinned fingerprints") //nolint:err113
	}

	return base
}

package webtransport

import (
	"crypto/tls"
	"time"
)

// Option configures a Client.
type Option func(*Client)

// WithConfig replaces the full Config.
func WithConfig(config *Config) Option {
	return func(c *Client) {
		c.config = config
	}
}

// WithTLSClientConfig sets a base tls.Config. When combined with
// WithCertHashes, the config is cloned and patched automatically.
func WithTLSClientConfig(cfg *tls.Config) Option {
	return func(c *Client) {
		c.config.TLSConfig = cfg
	}
}

// WithCertHashes pins connections to the supplied SHA-256 DER fingerprints.
// Mirrors the browser WebTransport serverCertificateHashes API. CA chain
// validation is skipped when any hashes are set.
func WithCertHashes(hashes [][]byte) Option {
	return func(c *Client) {
		c.config.CertHashes = hashes
	}
}

// WithDialTimeout caps QUIC connection establishment.
func WithDialTimeout(d time.Duration) Option {
	return func(c *Client) {
		c.config.DialTimeout = d
	}
}

// WithMaxIdleStreams caps idle streams per session.
func WithMaxIdleStreams(n uint64) Option {
	return func(c *Client) {
		c.config.MaxIdleStreams = n
	}
}

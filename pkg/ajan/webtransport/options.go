package webtransport

import (
	"crypto/tls"
	"errors"
	"time"
)

// ErrInvalidOption is wrapped by the error NewClient returns when an option was
// given a value no dial could succeed with.
var ErrInvalidOption = errors.New("invalid webtransport client option")

// Option configures a Client. An option given an invalid value returns an
// error wrapping ErrInvalidOption, and NewClient reports it.
type Option func(*Client) error

// WithConfig replaces the full Config with a copy of config, checked the same
// way as the individual options. A nil config means the defaults.
func WithConfig(config *Config) Option {
	return func(c *Client) error {
		if config == nil {
			c.config = Config{} //nolint:exhaustruct

			return nil
		}

		if err := validateConfig(config); err != nil {
			return err
		}

		c.config = *config

		return nil
	}
}

// WithTLSClientConfig sets a base tls.Config. When combined with
// WithCertHashes, the config is cloned and patched automatically. A MaxVersion
// below TLS 1.3 is an error, because QUIC cannot run over it.
func WithTLSClientConfig(cfg *tls.Config) Option {
	return func(c *Client) error {
		if err := validateTLSConfig(cfg); err != nil {
			return err
		}

		c.config.TLSConfig = cfg

		return nil
	}
}

// WithCertHashes pins connections to the supplied SHA-256 DER fingerprints.
// Mirrors the browser WebTransport serverCertificateHashes API. CA chain
// validation is skipped when any hashes are set. A hash that is not 32 bytes
// long is an error, because it could never match.
func WithCertHashes(hashes [][]byte) Option {
	return func(c *Client) error {
		if err := validateCertHashes(hashes); err != nil {
			return err
		}

		c.config.CertHashes = hashes

		return nil
	}
}

// WithDialTimeout bounds the QUIC handshake (see Config.DialTimeout). Zero
// keeps quic-go's default; a negative duration is an error.
func WithDialTimeout(d time.Duration) Option {
	return func(c *Client) error {
		if err := validateDialTimeout(d); err != nil {
			return err
		}

		c.config.DialTimeout = d

		return nil
	}
}

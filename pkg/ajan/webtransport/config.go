package webtransport

import (
	"crypto/sha256"
	"crypto/tls"
	"fmt"
	"time"
)

// Config holds configuration for a WebTransport Client. The shape is intentionally
// parallel to pkg/ajan/httpclient.Config so callers switching contexts need no
// relearning.
type Config struct {
	// TLSConfig is the base TLS configuration used when dialing QUIC connections.
	// MinVersion is raised to TLS 1.3 on a copy when it is lower; QUIC mandates
	// it. A MaxVersion below TLS 1.3 is rejected by NewClient.
	TLSConfig *tls.Config

	// CertHashes is a list of SHA-256 DER fingerprints for certificate pinning.
	// When non-empty, CA chain validation is skipped and the server certificate
	// is accepted only if its fingerprint matches one of the supplied hashes.
	// Use for self-signed noskills-server development certs. Each hash must be
	// 32 bytes long.
	CertHashes [][]byte

	// DialTimeout bounds the QUIC handshake. It sets quic-go's
	// HandshakeIdleTimeout, so a dial fails after DialTimeout without a reply,
	// and quic-go ends any handshake that takes longer than twice the value.
	// Zero keeps quic-go's default of 5s; a negative value is rejected.
	DialTimeout time.Duration
}

// validateConfig reports the first setting in cfg that no dial could succeed
// with. Every error wraps ErrInvalidOption.
func validateConfig(cfg *Config) error {
	if err := validateTLSConfig(cfg.TLSConfig); err != nil {
		return err
	}

	if err := validateCertHashes(cfg.CertHashes); err != nil {
		return err
	}

	return validateDialTimeout(cfg.DialTimeout)
}

func validateTLSConfig(tlsCfg *tls.Config) error {
	if tlsCfg == nil || tlsCfg.MaxVersion == 0 || tlsCfg.MaxVersion >= tls.VersionTLS13 {
		return nil
	}

	return fmt.Errorf(
		"%w: TLS MaxVersion %s is below TLS 1.3, which QUIC requires (leave MaxVersion at 0)",
		ErrInvalidOption, tls.VersionName(tlsCfg.MaxVersion),
	)
}

func validateCertHashes(hashes [][]byte) error {
	for i, hash := range hashes {
		if len(hash) != sha256.Size {
			return fmt.Errorf(
				"%w: cert hash %d is %d bytes, want %d (the SHA-256 digest of the certificate's DER)",
				ErrInvalidOption, i, len(hash), sha256.Size,
			)
		}
	}

	return nil
}

func validateDialTimeout(timeout time.Duration) error {
	if timeout < 0 {
		return fmt.Errorf(
			"%w: dial timeout %s is negative (use 0 for quic-go's default of 5s)",
			ErrInvalidOption, timeout,
		)
	}

	return nil
}

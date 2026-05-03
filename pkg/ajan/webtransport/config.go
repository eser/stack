package webtransport

import (
	"crypto/tls"
	"time"
)

// Config holds configuration for a WebTransport Client. The shape is intentionally
// parallel to pkg/ajan/httpclient.Config so callers switching contexts need no
// relearning.
type Config struct {
	// TLSConfig is the base TLS configuration used when dialing QUIC connections.
	// MinVersion is forced to TLS 1.3; QUIC mandates it.
	TLSConfig *tls.Config

	// CertHashes is a list of SHA-256 DER fingerprints for certificate pinning.
	// When non-empty, CA chain validation is skipped and the server certificate
	// is accepted only if its fingerprint matches one of the supplied hashes.
	// Use for self-signed noskills-server development certs.
	CertHashes [][]byte

	// DialTimeout caps QUIC connection establishment. Zero means no cap.
	DialTimeout time.Duration

	// MaxIdleStreams caps the number of idle streams per session. Zero means no cap.
	MaxIdleStreams uint64
}

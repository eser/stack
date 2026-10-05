package webtransport

import (
	"bytes"
	"context"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"sync"

	"github.com/quic-go/quic-go"
	"github.com/quic-go/webtransport-go"
)

// ErrClientClosed is returned by Connect and ConnectWithHeaders once Close has
// been called, including by a dial that Close interrupted.
var ErrClientClosed = errors.New("webtransport client closed")

// Client dials WebTransport sessions. It is safe for concurrent use.
// Create one per logical endpoint; sessions are created via Connect.
type Client struct {
	config Config
	dialer *webtransport.Transport

	// closed is closed by Close. Every dial watches it, so Close ends a dial in
	// any phase, the QUIC handshake included. Close does not call
	// Transport.Close: webtransport-go v0.13 panics when that runs before the
	// first Dial, and it would only end the wait for the server's settings.
	closed    chan struct{}
	closeOnce sync.Once
}

// NewClient creates a Client with the supplied options. Nothing is dialed
// until Connect. It returns an error wrapping ErrInvalidOption when an option
// was given a value no dial could succeed with.
func NewClient(opts ...Option) (*Client, error) {
	c := &Client{ //nolint:exhaustruct
		closed: make(chan struct{}),
	}

	for _, o := range opts {
		if err := o(c); err != nil {
			return nil, fmt.Errorf("new webtransport client: %w", err)
		}
	}

	tlsCfg := buildDialerTLSConfig(&c.config)

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

	return c, nil
}

// Connect dials the given WebTransport URL and returns a Session. The caller
// is responsible for calling Session.Close when done.
func (c *Client) Connect(ctx context.Context, rawURL string) (*Session, error) {
	return c.ConnectWithHeaders(ctx, rawURL, nil)
}

// ConnectWithHeaders dials with additional request headers, such as
// "Authorization: Bearer <token>" for token auth. Errors name the URL without
// its query or user info, so a token placed there does not reach a log.
func (c *Client) ConnectWithHeaders(
	ctx context.Context,
	rawURL string,
	headers http.Header,
) (*Session, error) {
	target, err := url.Parse(rawURL)
	if err != nil {
		// url.Error repeats the raw URL, query included; keep only the cause.
		if urlErr, ok := errors.AsType[*url.Error](err); ok {
			err = urlErr.Err
		}

		return nil, fmt.Errorf("webtransport dial: parse url: %w", err)
	}

	endpoint := redactedURL(target)

	select {
	case <-c.closed:
		return nil, fmt.Errorf("webtransport dial %s: %w", endpoint, ErrClientClosed)
	default:
	}

	dialCtx, cancel := context.WithCancelCause(ctx)
	defer cancel(nil)

	// Ends with this call at the latest: the deferred cancel ends dialCtx.
	go func() {
		select {
		case <-c.closed:
			cancel(ErrClientClosed)
		case <-dialCtx.Done():
		}
	}()

	_, sess, err := c.dialer.Dial(dialCtx, rawURL, headers)
	if err != nil {
		if errors.Is(context.Cause(dialCtx), ErrClientClosed) {
			return nil, fmt.Errorf("webtransport dial %s: %w", endpoint, ErrClientClosed)
		}

		return nil, fmt.Errorf("webtransport dial %s: %w", endpoint, err)
	}

	return &Session{inner: sess}, nil
}

// Close ends every in-flight Connect, which then returns ErrClientClosed, and
// makes later calls return it as well. Sessions already returned stay open;
// close each with Session.Close. Close is safe to call more than once and
// always returns nil.
func (c *Client) Close() error {
	c.closeOnce.Do(func() {
		close(c.closed)
	})

	return nil
}

// redactedURL returns target's scheme, host and path. The query, fragment and
// user info are left out because they can carry credentials.
func redactedURL(target *url.URL) string {
	redacted := url.URL{ //nolint:exhaustruct
		Scheme: target.Scheme,
		Host:   target.Host,
		Path:   target.Path,
	}

	return redacted.String()
}

// buildDialerTLSConfig constructs the effective tls.Config for the Dialer.
// The caller's config is never modified: a MinVersion below TLS 1.3 is raised
// on a clone. When CertHashes are provided, InsecureSkipVerify +
// VerifyPeerCertificate are injected so a self-signed development cert is
// accepted when, and only when, its leaf fingerprint matches a supplied hash.
func buildDialerTLSConfig(cfg *Config) *tls.Config {
	if len(cfg.CertHashes) == 0 {
		base := cfg.TLSConfig
		if base == nil {
			return &tls.Config{MinVersion: tls.VersionTLS13} //nolint:exhaustruct
		}

		if base.MinVersion < tls.VersionTLS13 {
			base = base.Clone()
			base.MinVersion = tls.VersionTLS13
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

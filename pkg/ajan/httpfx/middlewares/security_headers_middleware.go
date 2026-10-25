package middlewares

import (
	"net"
	"strings"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/lib/netlib"
)

const (
	// DefaultReferrerPolicy sends the full URL only to the same origin and the
	// bare origin to other HTTPS sites, so ids and tokens in paths or query
	// strings do not leak to third parties.
	DefaultReferrerPolicy = "strict-origin-when-cross-origin"

	// DefaultPermissionsPolicy turns off the powerful browser features a page
	// can request, for the page and everything it embeds.
	DefaultPermissionsPolicy = "accelerometer=(), camera=(), display-capture=(), geolocation=(), " +
		"gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"

	strictTransportSecurityValue = "max-age=31536000; includeSubDomains"
)

// SecurityHeadersOption configures SecurityHeadersMiddleware.
type SecurityHeadersOption func(*securityHeadersConfig)

type securityHeadersConfig struct {
	trustedProxies    *httpfx.TrustedProxies
	referrerPolicy    string
	permissionsPolicy string
}

// WithReferrerPolicy replaces DefaultReferrerPolicy. An empty policy omits the
// Referrer-Policy header.
func WithReferrerPolicy(policy string) SecurityHeadersOption {
	return func(cfg *securityHeadersConfig) {
		cfg.referrerPolicy = policy
	}
}

// WithPermissionsPolicy replaces DefaultPermissionsPolicy, for a page that
// needs a feature such as "camera=(self)". An empty policy omits the
// Permissions-Policy header.
func WithPermissionsPolicy(policy string) SecurityHeadersOption {
	return func(cfg *securityHeadersConfig) {
		cfg.permissionsPolicy = policy
	}
}

// WithSecurityHeadersTrustedProxies lets a TLS-terminating proxy from the
// allowlist mark a request as HTTPS with "X-Forwarded-Proto: https", so HSTS
// is still sent behind it. The header is ignored from any other peer.
func WithSecurityHeadersTrustedProxies(trustedProxies *httpfx.TrustedProxies) SecurityHeadersOption {
	return func(cfg *securityHeadersConfig) {
		cfg.trustedProxies = trustedProxies
	}
}

// SecurityHeadersMiddleware sets security response headers on every response:
// X-Content-Type-Options, X-Frame-Options, Referrer-Policy and
// Permissions-Policy, plus Strict-Transport-Security on HTTPS requests only.
func SecurityHeadersMiddleware(options ...SecurityHeadersOption) httpfx.Handler {
	cfg := &securityHeadersConfig{
		trustedProxies:    nil,
		referrerPolicy:    DefaultReferrerPolicy,
		permissionsPolicy: DefaultPermissionsPolicy,
	}

	for _, option := range options {
		option(cfg)
	}

	return func(ctx *httpfx.Context) httpfx.Result {
		headers := ctx.ResponseWriter.Header()

		// Prevent MIME type sniffing
		headers.Set("X-Content-Type-Options", "nosniff")

		// Prevent clickjacking
		headers.Set("X-Frame-Options", "DENY")

		if cfg.referrerPolicy != "" {
			headers.Set("Referrer-Policy", cfg.referrerPolicy)
		}

		if cfg.permissionsPolicy != "" {
			headers.Set("Permissions-Policy", cfg.permissionsPolicy)
		}

		// RFC 6797 section 7.2: HSTS is sent over secure transport only.
		if isHTTPSRequest(ctx, cfg.trustedProxies) {
			headers.Set("Strict-Transport-Security", strictTransportSecurityValue)
		}

		return ctx.Next()
	}
}

func isHTTPSRequest(ctx *httpfx.Context, trustedProxies *httpfx.TrustedProxies) bool {
	if ctx.Request.TLS != nil {
		return true
	}

	if trustedProxies.IsEmpty() {
		return false
	}

	host, _, err := netlib.SplitHostPort(ctx.Request.RemoteAddr)
	if err != nil || !trustedProxies.Contains(net.ParseIP(host)) {
		return false
	}

	return strings.EqualFold(ctx.Request.Header.Get("X-Forwarded-Proto"), "https")
}

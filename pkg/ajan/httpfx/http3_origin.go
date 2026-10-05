package httpfx

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
)

var (
	// ErrHTTP3InvalidAllowedOrigin is returned by HTTP3Service.Start when an
	// entry of Config.H3AllowedOrigins is not an exact origin.
	ErrHTTP3InvalidAllowedOrigin = errors.New("HTTP3 invalid allowed WebTransport origin")

	// ErrWebTransportOriginNotAllowed is returned by WebTransportUpgrader.Upgrade
	// when the request's Origin header names neither the server itself nor an
	// origin listed in Config.H3AllowedOrigins.
	ErrWebTransportOriginNotAllowed = errors.New("WebTransport request origin not allowed")

	errOriginScheme   = errors.New("scheme must be http or https")
	errOriginShape    = errors.New("want scheme://host[:port] with nothing after the host")
	errOriginWildcard = errors.New("wildcards are not supported; list each origin")
)

// webTransportOriginCheck decides which pages may open a WebTransport
// session. A browser sends the page's origin on the CONNECT, and the check
// stops another site's page from opening a session through its visitor's
// browser, which can reach servers that site cannot, such as one on
// localhost (cross-site request forgery).
type webTransportOriginCheck struct {
	allowed map[string]struct{}
}

// newWebTransportOriginCheck normalizes allowedOrigins once. Every entry must
// be an exact origin; there are no wildcards.
func newWebTransportOriginCheck(allowedOrigins []string) (*webTransportOriginCheck, error) {
	allowed := make(map[string]struct{}, len(allowedOrigins))

	for _, entry := range allowedOrigins {
		origin, err := normalizeOrigin(entry)
		if err != nil {
			return nil, fmt.Errorf("%w %q: %w", ErrHTTP3InvalidAllowedOrigin, entry, err)
		}

		allowed[origin] = struct{}{}
	}

	return &webTransportOriginCheck{allowed: allowed}, nil
}

// allows reports whether r may be upgraded. As in webtransport-go's own
// default, a request without an Origin header passes, since it does not come
// from a browser page, and so does one whose origin host equals the request's
// Host. Any other origin passes only when it is listed.
func (c *webTransportOriginCheck) allows(r *http.Request) bool {
	header := r.Header.Get("Origin")
	if header == "" {
		return true
	}

	origin, err := url.Parse(header)
	if err != nil {
		return false
	}

	if strings.EqualFold(origin.Host, r.Host) {
		return true
	}

	normalized, err := normalizeOrigin(header)
	if err != nil {
		return false
	}

	_, listed := c.allowed[normalized]

	return listed
}

// normalizeOrigin returns raw as an origin serialized the way browsers send
// it: a lowercase http or https scheme and host, and no port when it is the
// scheme's default.
func normalizeOrigin(raw string) (string, error) {
	parsed, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("parse origin: %w", err)
	}

	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return "", errOriginScheme
	}

	if parsed.Hostname() == "" || parsed.Opaque != "" || parsed.User != nil || parsed.Path != "" ||
		parsed.RawQuery != "" || parsed.ForceQuery || parsed.Fragment != "" {
		return "", errOriginShape
	}

	host := strings.ToLower(parsed.Hostname())
	if strings.Contains(host, "*") {
		return "", errOriginWildcard
	}

	port := parsed.Port()

	if (scheme == "https" && port == "443") || (scheme == "http" && port == "80") {
		port = ""
	}

	if port == "" {
		if strings.Contains(host, ":") {
			host = "[" + host + "]" // an IPv6 literal keeps its brackets
		}

		return scheme + "://" + host, nil
	}

	return scheme + "://" + net.JoinHostPort(host, port), nil
}

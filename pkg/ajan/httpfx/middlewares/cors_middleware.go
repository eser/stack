package middlewares

import (
	"net/http"
	"strings"

	"github.com/eser/stack/pkg/ajan/httpfx"
)

// Constants for CORS headers.
const (
	AccessControlAllowOriginHeader      = "Access-Control-Allow-Origin"
	AccessControlAllowCredentialsHeader = "Access-Control-Allow-Credentials"
	AccessControlAllowHeadersHeader     = "Access-Control-Allow-Headers"
	AccessControlAllowMethodsHeader     = "Access-Control-Allow-Methods"
	AccessControlMaxAgeHeader           = "Access-Control-Max-Age"
	VaryHeader                          = "Vary"
)

// wildcardOrigin grants any origin anonymous access. The CORS spec forbids
// pairing it with credentials, so credentialed access needs an explicit origin.
const wildcardOrigin = "*"

// preflightMaxAge is the duration in seconds that browsers can cache preflight responses.
const preflightMaxAge = "3600"

// corsConfig holds the configuration for CORS headers.
// It is unexported as it's an internal detail of the CorsMiddleware.
type corsConfig struct {
	allowOrigin      string
	allowHeaders     []string
	allowMethods     []string
	allowCredentials bool
}

// CorsOption is a function type that modifies the corsConfig.
type CorsOption func(*corsConfig)

// WithAllowOrigin sets the Access-Control-Allow-Origin header. It accepts a
// single origin, "*", or a comma-separated allowlist that is matched against the
// request Origin. If not set, defaults to "*".
func WithAllowOrigin(origin string) CorsOption {
	return func(cfg *corsConfig) {
		cfg.allowOrigin = origin
	}
}

// WithAllowCredentials sets the Access-Control-Allow-Credentials header. It only
// takes effect alongside an explicit origin; under a wildcard the header is
// suppressed, since browsers reject that combination anyway.
func WithAllowCredentials(allow bool) CorsOption {
	return func(cfg *corsConfig) {
		cfg.allowCredentials = allow
	}
}

// WithAllowHeaders sets the Access-Control-Allow-Headers header.
func WithAllowHeaders(headers []string) CorsOption {
	return func(cfg *corsConfig) {
		cfg.allowHeaders = headers
	}
}

// WithAllowMethods sets the Access-Control-Allow-Methods header.
func WithAllowMethods(methods []string) CorsOption {
	return func(cfg *corsConfig) {
		cfg.allowMethods = methods
	}
}

// resolveAllowedOrigin maps the configured origin (a single origin, "*", or a
// comma-separated allowlist) onto the value for Access-Control-Allow-Origin. It
// returns "" when the request origin is not on the allowlist; a wildcard alone
// never justifies reflecting the caller's origin back.
func resolveAllowedOrigin(configured, requestOrigin string) string {
	trimmed := strings.TrimSpace(configured)

	if !strings.Contains(trimmed, ",") {
		return trimmed
	}

	hasWildcard := false

	for rawEntry := range strings.SplitSeq(trimmed, ",") {
		entry := strings.TrimSpace(rawEntry)

		if entry == wildcardOrigin {
			hasWildcard = true

			continue
		}

		if entry != "" && entry == requestOrigin {
			return requestOrigin
		}
	}

	if hasWildcard {
		return wildcardOrigin
	}

	return ""
}

// CorsMiddleware creates a CORS middleware using functional options.
func CorsMiddleware(options ...CorsOption) httpfx.Handler { //nolint:cyclop,funlen
	// Start with default configuration
	cfg := &corsConfig{
		allowOrigin: wildcardOrigin, // Default to allow all origins
		// Credentialed cross-origin access requires an explicit origin allowlist,
		// so this stays off until a caller opts in via WithAllowCredentials.
		allowCredentials: false,
		allowHeaders: []string{
			"Accept",
			"Authorization",
			"Content-Type",
			"Origin",
			"Traceparent",
			"Tracestate",
			"X-Requested-With",
		},
		allowMethods: []string{"GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"},
	}

	// Apply all provided options
	for _, option := range options {
		option(cfg)
	}

	return func(ctx *httpfx.Context) httpfx.Result {
		headers := ctx.ResponseWriter.Header()

		// Determine allowed origin based on request origin
		requestOrigin := ctx.Request.Header.Get("Origin")
		allowedOrigin := resolveAllowedOrigin(cfg.allowOrigin, requestOrigin)

		// Set CORS headers for all requests
		if allowedOrigin != "" {
			headers.Set(AccessControlAllowOriginHeader, allowedOrigin)
		}

		// Any answer other than the literal wildcard is derived from the request
		// Origin, so shared caches must key on it.
		if allowedOrigin != wildcardOrigin {
			headers.Add(VaryHeader, "Origin")
		}

		if cfg.allowCredentials && allowedOrigin != "" && allowedOrigin != wildcardOrigin {
			headers.Set(AccessControlAllowCredentialsHeader, "true")
		}

		// For non-preflight requests, set headers and continue
		if len(cfg.allowHeaders) > 0 {
			headers.Set(AccessControlAllowHeadersHeader, strings.Join(cfg.allowHeaders, ", "))
		}

		if len(cfg.allowMethods) > 0 {
			headers.Set(AccessControlAllowMethodsHeader, strings.Join(cfg.allowMethods, ", "))
		}

		// Handle preflight OPTIONS requests
		if ctx.Request.Method == http.MethodOptions {
			headers.Set(AccessControlMaxAgeHeader, preflightMaxAge)

			return ctx.Results.Ok()
		}

		return ctx.Next()
	}
}

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
)

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

// WithAllowOrigin sets the Access-Control-Allow-Origin header.
// If not set, defaults to "*".
func WithAllowOrigin(origin string) CorsOption {
	return func(cfg *corsConfig) {
		cfg.allowOrigin = origin
	}
}

// WithAllowCredentials sets the Access-Control-Allow-Credentials header.
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

// CorsMiddleware creates a CORS middleware using functional options.
func CorsMiddleware(options ...CorsOption) httpfx.Handler { //nolint:cyclop,funlen
	// Start with default configuration
	cfg := &corsConfig{
		allowOrigin:      "*", // Default to allow all origins
		allowCredentials: true,
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
		allowedOrigin := cfg.allowOrigin

		// If multiple origins are configured (comma-separated), check if request origin is allowed
		if strings.Contains(cfg.allowOrigin, ",") {
			allowedOrigins := strings.Split(cfg.allowOrigin, ",")
			for _, origin := range allowedOrigins {
				origin = strings.TrimSpace(origin)
				if origin == requestOrigin {
					allowedOrigin = requestOrigin

					break
				}
			}

			// If no match found and wildcard not set, use first origin as fallback
			if allowedOrigin != requestOrigin && !strings.Contains(cfg.allowOrigin, "*") {
				allowedOrigin = strings.TrimSpace(allowedOrigins[0])
			}
		} else if cfg.allowOrigin == "*" && cfg.allowCredentials && requestOrigin != "" {
			// When credentials are enabled with wildcard origin, we must echo back the
			// specific request origin instead of "*" (CORS spec requirement)
			allowedOrigin = requestOrigin
		}

		// Set CORS headers for all requests
		headers.Set(AccessControlAllowOriginHeader, allowedOrigin)

		if cfg.allowCredentials {
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

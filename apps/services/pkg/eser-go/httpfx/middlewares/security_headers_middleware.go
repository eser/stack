package middlewares

import (
	"github.com/eser/stack/apps/services/pkg/eser-go/httpfx"
)

// SecurityHeadersMiddleware sets standard security response headers on every response.
func SecurityHeadersMiddleware() httpfx.Handler {
	return func(ctx *httpfx.Context) httpfx.Result {
		headers := ctx.ResponseWriter.Header()

		// Prevent MIME type sniffing
		headers.Set("X-Content-Type-Options", "nosniff")

		// Prevent clickjacking
		headers.Set("X-Frame-Options", "DENY")

		// Enforce HTTPS for 1 year including subdomains
		headers.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")

		return ctx.Next()
	}
}

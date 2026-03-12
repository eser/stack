package middlewares

import (
	"fmt"
	"net/http"

	"github.com/eser/stack/apps/services/pkg/eser-go/httpfx"
)

// RequestSizeLimitMiddleware limits the maximum size of incoming request bodies.
// It prevents memory exhaustion attacks via large payloads.
func RequestSizeLimitMiddleware(maxBytes int64) httpfx.Handler {
	return func(ctx *httpfx.Context) httpfx.Result {
		// Limit the request body size
		ctx.Request.Body = http.MaxBytesReader(ctx.ResponseWriter, ctx.Request.Body, maxBytes)

		// Check if the request body exceeds the limit
		if ctx.Request.ContentLength > maxBytes {
			return ctx.Results.Error(http.StatusRequestEntityTooLarge,
				httpfx.WithPlainText(fmt.Sprintf(
					"Request body too large. Maximum size: %d bytes",
					maxBytes,
				)),
			)
		}

		return ctx.Next()
	}
}

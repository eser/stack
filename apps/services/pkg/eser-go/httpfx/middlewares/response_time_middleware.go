package middlewares

import (
	"time"

	"github.com/eser/stack/apps/services/pkg/eser-go/httpfx"
)

const ResponseTimeHeader = "X-Request-Time"

func ResponseTimeMiddleware() httpfx.Handler {
	return func(ctx *httpfx.Context) httpfx.Result {
		startTime := time.Now()

		result := ctx.Next()

		duration := time.Since(startTime)
		durationText := duration.String()

		ctx.ResponseWriter.Header().Set(ResponseTimeHeader, durationText)

		return result
	}
}

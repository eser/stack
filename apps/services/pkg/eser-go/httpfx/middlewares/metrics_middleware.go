package middlewares

import (
	"log/slog"
	"strconv"
	"time"

	"github.com/eser/stack/apps/services/pkg/eser-go/httpfx"
)

// MetricsMiddleware creates HTTP metrics middleware using the clean slog-based logfx approach.
func MetricsMiddleware(httpMetrics *httpfx.Metrics) httpfx.Handler {
	return func(ctx *httpfx.Context) httpfx.Result {
		startTime := time.Now()

		result := ctx.Next()

		duration := time.Since(startTime)

		// Use clean slog attributes directly - no intermediate slice needed
		httpMetrics.RequestsTotal.Inc(ctx.Request.Context(),
			slog.String("http.method", ctx.Request.Method),
			slog.String("http.path", ctx.Request.URL.Path),
			slog.String("http.status_code", strconv.Itoa(result.StatusCode())),
		)

		httpMetrics.RequestDuration.RecordDuration(ctx.Request.Context(), duration,
			slog.String("http.method", ctx.Request.Method),
			slog.String("http.path", ctx.Request.URL.Path),
			slog.String("http.status_code", strconv.Itoa(result.StatusCode())),
		)

		return result
	}
}

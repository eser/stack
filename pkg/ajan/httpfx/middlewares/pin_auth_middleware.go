package middlewares

import (
	"net/http"
	"strings"

	"github.com/eser/stack/pkg/ajan/httpfx"
)

// PinAuthMiddleware validates tokens issued by AuthManager.
//
// If isPINSetup() returns false (first run, before any PIN is configured) all
// requests pass through so the caller can reach POST /auth/setup.
//
// skip is called once per request; return true to bypass token validation
// (public endpoints: health, cert-fingerprint, auth/setup, auth/login).
//
// Token is extracted from "Authorization: Bearer <token>" or "?token=<value>"
// (WebTransport CONNECT requests cannot set headers, so the query-param path
// is required for WT upgrade flows).
func PinAuthMiddleware(
	isPINSetup func() bool,
	validator func(string) bool,
	skip func(*httpfx.Context) bool,
) httpfx.Handler {
	return func(ctx *httpfx.Context) httpfx.Result {
		if !isPINSetup() {
			return ctx.Next()
		}

		if skip != nil && skip(ctx) {
			return ctx.Next()
		}

		token := extractPinToken(ctx)

		if token != "" && validator(token) {
			return ctx.Next()
		}

		// Auth failure path splits on route type:
		//   • Raw routes (WebTransport): write response directly; RouteRaw skips
		//     the raw handler when ctx.EarlyWritten is true.
		//   • Normal routes: return a Result; MuxHandlerFunc writes it.
		if ctx.IsRaw {
			_ = ctx.WriteEarly(http.StatusUnauthorized, []byte(`{"error":"unauthorized"}`))

			return ctx.Results.Ok() // ignored by RouteRaw when EarlyWritten
		}

		return ctx.Results.Unauthorized(httpfx.WithPlainText("unauthorized"))
	}
}

func extractPinToken(ctx *httpfx.Context) string {
	for _, h := range ctx.Request.Header["Authorization"] {
		if after, ok := strings.CutPrefix(h, "Bearer "); ok {
			return after
		}
	}

	return ctx.Request.URL.Query().Get("token")
}

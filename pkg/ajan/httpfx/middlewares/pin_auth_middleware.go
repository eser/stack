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
// The token comes from the "Authorization: Bearer <token>" header. A
// WebTransport CONNECT on a raw route may carry it as "?token=<value>"
// instead, because browsers cannot set headers on that request. Every other
// request ignores the query string, since URLs reach access logs, browser
// history and Referer headers.
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

		// Route and RouteRaw both write this Result, and RouteRaw does not run
		// its raw handler after a rejection.
		return ctx.Results.Unauthorized(httpfx.WithPlainText("unauthorized"))
	}
}

func extractPinToken(ctx *httpfx.Context) string {
	for _, h := range ctx.Request.Header["Authorization"] {
		if after, ok := strings.CutPrefix(h, "Bearer "); ok {
			return after
		}
	}

	if isWebTransportConnect(ctx) {
		return ctx.Request.URL.Query().Get("token")
	}

	return ""
}

// isWebTransportConnect reports whether the request is an extended CONNECT
// for WebTransport on a raw route. The :protocol values are the ones
// webtransport-go accepts: "webtransport-h3" and the pre-draft-15 "webtransport".
func isWebTransportConnect(ctx *httpfx.Context) bool {
	if !ctx.IsRaw || ctx.Request.Method != http.MethodConnect {
		return false
	}

	return ctx.Request.Proto == "webtransport-h3" || ctx.Request.Proto == "webtransport"
}

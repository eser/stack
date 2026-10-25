// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsserverfx

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/eser/stack/pkg/ajan/httpfx"
)

// The dashboard listens on 127.0.0.1, which keeps other machines out but not
// other pages in the developer's browser: WebSockets are exempt from the
// same-origin policy, and an HTML form can post across origins. Two guards
// cover each other's gap, as in the TypeScript server (auth.ts):
//
//   - the Origin allowlist stops a page on another origin; a non-browser
//     client sets any Origin it likes, so it cannot stop that;
//   - the access token stops any client that has not read a dashboard page,
//     which a page on another origin cannot do.

const (
	// DashboardTokenHeader carries the token on mutating requests.
	DashboardTokenHeader = "X-Noskills-Token"
	// DashboardTokenQueryParam carries the token on the /mux upgrade, where a
	// browser cannot set headers.
	DashboardTokenQueryParam = "token"

	// dashboardTokenBytes is the size of a minted token before hex encoding.
	dashboardTokenBytes = 32
)

// NewDashboardToken mints an access token: 32 bytes from the CSPRNG,
// hex-encoded. A token minted per process is useless once the process ends.
func NewDashboardToken() (string, error) {
	buf := make([]byte, dashboardTokenBytes)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("mint a dashboard token: %w", err)
	}

	return hex.EncodeToString(buf), nil
}

// tokenMatches compares a supplied token with the expected one in constant
// time, so the comparison does not leak how much of a guess was right.
func tokenMatches(supplied, expected string) bool {
	if supplied == "" || expected == "" {
		return false
	}

	return subtle.ConstantTimeCompare([]byte(supplied), []byte(expected)) == 1
}

// dashboardOrigins are the origins a browser gives pages of the dashboard
// on port: localhost and the two loopback literals are three different
// origins, and anything else, a LAN address of the same machine included, is
// not one of them.
func dashboardOrigins(port int) map[string]bool {
	suffix := ":" + strconv.Itoa(port)

	return map[string]bool{
		"http://localhost" + suffix: true,
		"http://127.0.0.1" + suffix: true,
		"http://[::1]" + suffix:     true,
	}
}

// originAllowed reports whether a request's Origin is one of the dashboard's.
// A request without Origin passes: browsers send it on every cross-origin
// request, and the clients that omit it (curl, the CLI) are what the token
// is for.
func originAllowed(r *http.Request, origins map[string]bool) bool {
	origin := r.Header.Get("Origin")

	return origin == "" || origins[origin]
}

// hasJSONContentType reports whether the body is declared application/json.
// The three types an HTML form can post across origins without a preflight
// (form-urlencoded, multipart and text/plain) all fail it.
func hasJSONContentType(r *http.Request) bool {
	mediaType, _, _ := strings.Cut(r.Header.Get("Content-Type"), ";")

	return strings.EqualFold(strings.TrimSpace(mediaType), "application/json")
}

// isMutating reports whether a method changes server state.
func isMutating(method string) bool {
	switch method {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		return true
	default:
		return false
	}
}

// forbidden is the 403 the guards answer with. The reason says which guard
// refused, and nothing about the expected values.
func forbidden(ctx *httpfx.Context, reason string) httpfx.Result {
	return ctx.Results.Error(http.StatusForbidden, httpfx.WithPlainText("Forbidden: "+reason))
}

// dashboardGuard is the trust boundary in front of every route, in the
// order the TypeScript router applied it: the Origin check on /mux and on
// every mutating request, the JSON content type on mutating requests other
// than DELETE, and the header token on every mutating request. Reads of
// pages and static files stay open, so a page can load and hand the browser
// its token; /mux checks its query token itself, after the upgrade check.
func dashboardGuard(token string, port int) httpfx.Handler {
	origins := dashboardOrigins(port)

	return func(ctx *httpfx.Context) httpfx.Result {
		r := ctx.Request
		mutating := isMutating(r.Method)

		if (r.URL.Path == dashboardMuxPath || mutating) && !originAllowed(r, origins) {
			return forbidden(ctx, "origin not allowed")
		}

		if mutating && r.Method != http.MethodDelete && !hasJSONContentType(r) {
			return forbidden(ctx, "expected application/json")
		}

		if mutating && !tokenMatches(r.Header.Get(DashboardTokenHeader), token) {
			return forbidden(ctx, "missing or invalid token")
		}

		return ctx.Next()
	}
}

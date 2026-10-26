// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package middlewares_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/httpfx/middlewares"
)

func firstCSRFCookieHeader(t *testing.T, mw httpfx.Handler) string {
	t.Helper()

	rr := httptest.NewRecorder()
	ctx := &httpfx.Context{
		Request:        httptest.NewRequest(http.MethodGet, "/", nil),
		ResponseWriter: rr,
		Results:        httpfx.Results{},
	}
	_ = mw(ctx)

	return rr.Header().Get("Set-Cookie")
}

func TestCsrfMiddleware_WithCookiePath(t *testing.T) {
	t.Parallel()

	mw := middlewares.CsrfMiddleware(middlewares.WithCsrfCookiePath("/api"))
	cookie := firstCSRFCookieHeader(t, mw)

	if !strings.Contains(cookie, "Path=/api") {
		t.Errorf("expected Path=/api in Set-Cookie, got: %q", cookie)
	}
}

func TestCsrfMiddleware_WithSecure(t *testing.T) {
	t.Parallel()

	mw := middlewares.CsrfMiddleware(middlewares.WithCsrfSecure(true))
	cookie := firstCSRFCookieHeader(t, mw)

	if !strings.Contains(cookie, "Secure") {
		t.Errorf("expected Secure in Set-Cookie, got: %q", cookie)
	}
}

func TestCsrfMiddleware_WithSameSite(t *testing.T) {
	t.Parallel()

	mw := middlewares.CsrfMiddleware(middlewares.WithCsrfSameSite(http.SameSiteStrictMode))
	cookie := firstCSRFCookieHeader(t, mw)

	if !strings.Contains(cookie, "SameSite=Strict") {
		t.Errorf("expected SameSite=Strict in Set-Cookie, got: %q", cookie)
	}
}

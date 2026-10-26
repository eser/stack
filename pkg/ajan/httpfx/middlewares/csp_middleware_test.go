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

func applyCSPMiddleware(t *testing.T, mw httpfx.Handler) *httptest.ResponseRecorder {
	t.Helper()

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()

	ctx := &httpfx.Context{
		Request:        req,
		ResponseWriter: rr,
		Results:        httpfx.Results{},
	}

	_ = mw(ctx)

	return rr
}

func TestCspMiddleware_DefaultPolicy(t *testing.T) {
	t.Parallel()

	rr := applyCSPMiddleware(t, middlewares.CspMiddleware())
	csp := rr.Header().Get("Content-Security-Policy")

	if !strings.Contains(csp, "default-src 'self'") {
		t.Errorf("expected default-src 'self' in CSP, got: %q", csp)
	}
}

func TestCspMiddleware_CustomDirectives(t *testing.T) {
	t.Parallel()

	rr := applyCSPMiddleware(t,
		middlewares.CspMiddleware(
			middlewares.WithCspDefaultSrc("'none'"),
			middlewares.WithCspScriptSrc("'self'", "https://cdn.example.com"),
			middlewares.WithCspUpgradeInsecureRequests(),
		),
	)

	csp := rr.Header().Get("Content-Security-Policy")

	if !strings.Contains(csp, "default-src 'none'") {
		t.Errorf("expected default-src 'none', got: %q", csp)
	}

	if !strings.Contains(csp, "script-src 'self' https://cdn.example.com") {
		t.Errorf("expected script-src directive, got: %q", csp)
	}

	if !strings.Contains(csp, "upgrade-insecure-requests") {
		t.Errorf("expected upgrade-insecure-requests, got: %q", csp)
	}
}

func TestCspMiddleware_FrameAncestors(t *testing.T) {
	t.Parallel()

	rr := applyCSPMiddleware(t,
		middlewares.CspMiddleware(
			middlewares.WithCspFrameAncestors("'none'"),
		),
	)

	csp := rr.Header().Get("Content-Security-Policy")

	if !strings.Contains(csp, "frame-ancestors 'none'") {
		t.Errorf("expected frame-ancestors 'none', got: %q", csp)
	}
}

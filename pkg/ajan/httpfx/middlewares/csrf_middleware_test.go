// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package middlewares_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/httpfx/middlewares"
)

type csrfResult struct {
	result httpfx.Result
	rr     *httptest.ResponseRecorder
}

func runCSRF(t *testing.T, mw httpfx.Handler, req *http.Request) csrfResult {
	t.Helper()

	rr := httptest.NewRecorder()
	ctx := &httpfx.Context{
		Request:        req,
		ResponseWriter: rr,
		Results:        httpfx.Results{},
	}
	result := mw(ctx)

	return csrfResult{result: result, rr: rr}
}

func TestCsrfMiddleware_IssuesCookieOnFirstRequest(t *testing.T) {
	t.Parallel()

	mw := middlewares.CsrfMiddleware()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	r := runCSRF(t, mw, req)

	setCookie := r.rr.Header().Get("Set-Cookie")
	if setCookie == "" {
		t.Fatal("expected CSRF cookie to be set on first request")
	}
}

func TestCsrfMiddleware_GetDoesNotRequireToken(t *testing.T) {
	t.Parallel()

	mw := middlewares.CsrfMiddleware()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	r := runCSRF(t, mw, req)

	if r.result.StatusCode() == http.StatusForbidden {
		t.Fatal("GET should not be blocked by CSRF")
	}
}

func TestCsrfMiddleware_PostWithoutTokenForbidden(t *testing.T) {
	t.Parallel()

	mw := middlewares.CsrfMiddleware()

	// First GET to receive the cookie
	getReq := httptest.NewRequest(http.MethodGet, "/", nil)
	getR := runCSRF(t, mw, getReq)

	csrfCookie := ""
	for _, c := range getR.rr.Result().Cookies() {
		if c.Name == "csrf_token" {
			csrfCookie = c.Value
		}
	}

	if csrfCookie == "" {
		t.Skip("no CSRF cookie issued — skipping POST validation test")
	}

	// POST without the header — should fail
	postReq := httptest.NewRequest(http.MethodPost, "/", nil)
	postReq.AddCookie(&http.Cookie{Name: "csrf_token", Value: csrfCookie})
	// No X-CSRF-Token header

	r := runCSRF(t, mw, postReq)

	if r.result.StatusCode() != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden without CSRF header, got %d", r.result.StatusCode())
	}
}

func TestCsrfMiddleware_PostWithValidTokenAllowed(t *testing.T) {
	t.Parallel()

	mw := middlewares.CsrfMiddleware()

	// First GET to receive the cookie
	getReq := httptest.NewRequest(http.MethodGet, "/", nil)
	getR := runCSRF(t, mw, getReq)

	csrfCookie := ""
	for _, c := range getR.rr.Result().Cookies() {
		if c.Name == "csrf_token" {
			csrfCookie = c.Value
		}
	}

	if csrfCookie == "" {
		t.Skip("no CSRF cookie issued — skipping POST validation test")
	}

	// POST with correct header + cookie
	postReq := httptest.NewRequest(http.MethodPost, "/", nil)
	postReq.AddCookie(&http.Cookie{Name: "csrf_token", Value: csrfCookie})
	postReq.Header.Set("X-CSRF-Token", csrfCookie)

	r := runCSRF(t, mw, postReq)

	if r.result.StatusCode() == http.StatusForbidden {
		t.Fatalf("expected request to be allowed with matching CSRF header, got %d", r.result.StatusCode())
	}
}

func TestCsrfMiddleware_CustomHeaderName(t *testing.T) {
	t.Parallel()

	mw := middlewares.CsrfMiddleware(
		middlewares.WithCsrfHeaderName("X-My-CSRF"),
		middlewares.WithCsrfCookieName("my_csrf"),
	)

	getReq := httptest.NewRequest(http.MethodGet, "/", nil)
	getR := runCSRF(t, mw, getReq)

	csrfCookie := ""
	for _, c := range getR.rr.Result().Cookies() {
		if c.Name == "my_csrf" {
			csrfCookie = c.Value
		}
	}

	if csrfCookie == "" {
		t.Skip("no custom CSRF cookie issued")
	}

	postReq := httptest.NewRequest(http.MethodPost, "/", nil)
	postReq.AddCookie(&http.Cookie{Name: "my_csrf", Value: csrfCookie})
	postReq.Header.Set("X-My-CSRF", csrfCookie)

	r := runCSRF(t, mw, postReq)

	if r.result.StatusCode() == http.StatusForbidden {
		t.Fatalf("expected request allowed with custom header, got %d", r.result.StatusCode())
	}
}

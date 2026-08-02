// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package middlewares

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"

	"github.com/eser/stack/pkg/ajan/httpfx"
)

const (
	defaultCSRFCookieName = "csrf_token"
	defaultCSRFHeaderName = "X-CSRF-Token"
	csrfTokenBytes        = 16
)

// csrfConfig holds configuration for CsrfMiddleware.
type csrfConfig struct {
	cookieName string
	headerName string
	cookiePath string
	sameSite   http.SameSite
	secure     bool
	httpOnly   bool
}

// CsrfOption is a functional option for CsrfMiddleware.
type CsrfOption func(*csrfConfig)

// WithCsrfCookieName sets the cookie name used to store the CSRF token.
func WithCsrfCookieName(name string) CsrfOption {
	return func(c *csrfConfig) { c.cookieName = name }
}

// WithCsrfHeaderName sets the request header the client must echo the token in.
func WithCsrfHeaderName(name string) CsrfOption {
	return func(c *csrfConfig) { c.headerName = name }
}

// WithCsrfCookiePath sets the Path attribute on the CSRF cookie.
func WithCsrfCookiePath(path string) CsrfOption {
	return func(c *csrfConfig) { c.cookiePath = path }
}

// WithCsrfSecure sets the Secure flag on the CSRF cookie.
func WithCsrfSecure(secure bool) CsrfOption {
	return func(c *csrfConfig) { c.secure = secure }
}

// WithCsrfSameSite sets the SameSite attribute on the CSRF cookie.
func WithCsrfSameSite(s http.SameSite) CsrfOption {
	return func(c *csrfConfig) { c.sameSite = s }
}

// CsrfMiddleware implements the double-submit cookie CSRF protection pattern.
//
// On every request:
//   - If the CSRF cookie is absent, a new random token is issued.
//   - For mutating methods (POST, PUT, PATCH, DELETE), the value of the
//     X-CSRF-Token request header must match the cookie value; if not,
//     the request is rejected with 403 Forbidden.
//
// Clients must:
//  1. Read the csrf_token cookie (JS-accessible — not HttpOnly).
//  2. Send it back in the X-CSRF-Token header on every mutating request.
func CsrfMiddleware(options ...CsrfOption) httpfx.Handler {
	cfg := &csrfConfig{
		cookieName: defaultCSRFCookieName,
		headerName: defaultCSRFHeaderName,
		cookiePath: "/",
		sameSite:   http.SameSiteLaxMode,
		secure:     false,
		httpOnly:   false, // Must be JS-readable so the client can echo it
	}

	for _, opt := range options {
		opt(cfg)
	}

	return func(ctx *httpfx.Context) httpfx.Result {
		r := ctx.Request
		w := ctx.ResponseWriter

		// Retrieve or generate the CSRF token.
		cookie, err := r.Cookie(cfg.cookieName)

		var token string

		if err != nil || cookie.Value == "" {
			token = generateCSRFToken()
			http.SetCookie(w, &http.Cookie{
				Name:     cfg.cookieName,
				Value:    token,
				Path:     cfg.cookiePath,
				SameSite: cfg.sameSite,
				Secure:   cfg.secure,
				HttpOnly: cfg.httpOnly,
			})
		} else {
			token = cookie.Value
		}

		// Validate the token on mutating methods.
		switch r.Method {
		case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
			reqToken := r.Header.Get(cfg.headerName)
			if reqToken == "" || reqToken != token {
				return ctx.Results.Error(http.StatusForbidden,
					httpfx.WithPlainText("CSRF token missing or invalid"),
				)
			}
		}

		return ctx.Next()
	}
}

// generateCSRFToken returns a cryptographically random hex-encoded token.
func generateCSRFToken() string {
	b := make([]byte, csrfTokenBytes)
	_, _ = rand.Read(b)

	return hex.EncodeToString(b)
}

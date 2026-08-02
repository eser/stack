// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package middlewares_test

import (
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx/middlewares"
)

func TestCspMiddleware_StyleSrc(t *testing.T) {
	t.Parallel()

	rr := applyCSPMiddleware(t, middlewares.CspMiddleware(middlewares.WithCspStyleSrc("'self'")))

	if !strings.Contains(rr.Header().Get("Content-Security-Policy"), "style-src 'self'") {
		t.Errorf("expected style-src in CSP, got: %q", rr.Header().Get("Content-Security-Policy"))
	}
}

func TestCspMiddleware_ImgSrc(t *testing.T) {
	t.Parallel()

	rr := applyCSPMiddleware(t, middlewares.CspMiddleware(middlewares.WithCspImgSrc("'self'", "data:")))

	if !strings.Contains(rr.Header().Get("Content-Security-Policy"), "img-src 'self' data:") {
		t.Errorf("expected img-src in CSP, got: %q", rr.Header().Get("Content-Security-Policy"))
	}
}

func TestCspMiddleware_FontSrc(t *testing.T) {
	t.Parallel()

	rr := applyCSPMiddleware(t, middlewares.CspMiddleware(middlewares.WithCspFontSrc("https://fonts.gstatic.com")))

	if !strings.Contains(rr.Header().Get("Content-Security-Policy"), "font-src") {
		t.Errorf("expected font-src in CSP, got: %q", rr.Header().Get("Content-Security-Policy"))
	}
}

func TestCspMiddleware_ConnectSrc(t *testing.T) {
	t.Parallel()

	rr := applyCSPMiddleware(t, middlewares.CspMiddleware(middlewares.WithCspConnectSrc("'self'")))

	if !strings.Contains(rr.Header().Get("Content-Security-Policy"), "connect-src") {
		t.Errorf("expected connect-src in CSP, got: %q", rr.Header().Get("Content-Security-Policy"))
	}
}

func TestCspMiddleware_FrameSrc(t *testing.T) {
	t.Parallel()

	rr := applyCSPMiddleware(t, middlewares.CspMiddleware(middlewares.WithCspFrameSrc("'none'")))

	if !strings.Contains(rr.Header().Get("Content-Security-Policy"), "frame-src 'none'") {
		t.Errorf("expected frame-src in CSP, got: %q", rr.Header().Get("Content-Security-Policy"))
	}
}

func TestCspMiddleware_ObjectSrc(t *testing.T) {
	t.Parallel()

	rr := applyCSPMiddleware(t, middlewares.CspMiddleware(middlewares.WithCspObjectSrc("'none'")))

	if !strings.Contains(rr.Header().Get("Content-Security-Policy"), "object-src 'none'") {
		t.Errorf("expected object-src in CSP, got: %q", rr.Header().Get("Content-Security-Policy"))
	}
}

func TestCspMiddleware_BaseURI(t *testing.T) {
	t.Parallel()

	rr := applyCSPMiddleware(t, middlewares.CspMiddleware(middlewares.WithCspBaseURI("'self'")))

	if !strings.Contains(rr.Header().Get("Content-Security-Policy"), "base-uri 'self'") {
		t.Errorf("expected base-uri in CSP, got: %q", rr.Header().Get("Content-Security-Policy"))
	}
}

func TestCspMiddleware_BlockAllMixedContent(t *testing.T) {
	t.Parallel()

	rr := applyCSPMiddleware(t, middlewares.CspMiddleware(middlewares.WithCspBlockAllMixedContent()))

	if !strings.Contains(rr.Header().Get("Content-Security-Policy"), "block-all-mixed-content") {
		t.Errorf("expected block-all-mixed-content in CSP, got: %q", rr.Header().Get("Content-Security-Policy"))
	}
}

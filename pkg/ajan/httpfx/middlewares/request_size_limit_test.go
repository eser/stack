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

func applyRequestSizeMiddleware(t *testing.T, maxBytes int64, req *http.Request) httpfx.Result {
	t.Helper()

	rr := httptest.NewRecorder()
	ctx := &httpfx.Context{
		Request:        req,
		ResponseWriter: rr,
		Results:        httpfx.Results{},
	}

	mw := middlewares.RequestSizeLimitMiddleware(maxBytes)

	return mw(ctx)
}

func TestRequestSizeLimitMiddleware_SmallBody(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader("small"))
	result := applyRequestSizeMiddleware(t, 1024, req)

	// Should pass through (no error before Next).
	if result.StatusCode() == http.StatusRequestEntityTooLarge {
		t.Error("small body should not trigger size limit")
	}
}

func TestRequestSizeLimitMiddleware_ContentLengthExceedsLimit(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader("x"))
	req.ContentLength = 2000 // explicitly set large ContentLength header

	result := applyRequestSizeMiddleware(t, 1024, req)

	if result.StatusCode() != http.StatusRequestEntityTooLarge {
		t.Errorf("expected 413, got %d", result.StatusCode())
	}
}

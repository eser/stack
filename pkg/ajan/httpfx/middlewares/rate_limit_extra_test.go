// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package middlewares_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/httpfx/middlewares"
)

func TestRateLimitMiddleware_WithUserKeyFunc(t *testing.T) {
	t.Parallel()

	userKeyFunc := func(*httpfx.Context) string { return "user-42" }

	mw := middlewares.RateLimitMiddleware(
		middlewares.WithUserKeyFunc(userKeyFunc),
		middlewares.WithRateLimiterRequestsPerMinute(100),
		middlewares.WithRateLimiterWindowSize(time.Minute),
	)

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()
	ctx := &httpfx.Context{
		Request:        req,
		ResponseWriter: rr,
		Results:        httpfx.Results{},
	}

	result := mw(ctx)

	// With 100 req/min and only 1 request, should not be rate limited.
	if result.StatusCode() == http.StatusTooManyRequests {
		t.Error("single request should not be rate limited")
	}
}

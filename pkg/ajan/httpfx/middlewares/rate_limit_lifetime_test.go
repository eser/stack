// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package middlewares_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"runtime/pprof"
	"strings"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/httpfx/middlewares"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// goroutinesStartedByMiddlewares counts the live goroutines whose creator is
// a function of the middlewares package itself. The goroutines of this test
// package are created by middlewares_test functions, and those of the HTTP
// servers by net/http, so the count does not change with the tests that run
// alongside.
func goroutinesStartedByMiddlewares(t *testing.T) int {
	t.Helper()

	var stacks bytes.Buffer

	// debug=2 prints every goroutine the way a panic does, ending each one
	// with the "created by" line that names the function that started it.
	err := pprof.Lookup("goroutine").WriteTo(&stacks, 2)
	require.NoError(t, err, "write the goroutine profile")

	return strings.Count(stacks.String(), "created by github.com/eser/stack/pkg/ajan/httpfx/middlewares.")
}

// Each RateLimitMiddleware call builds its own limiter. Nothing outlives the
// handler it returns: building a thousand of them, as router rebuilds and
// tests do, leaves no goroutine behind.
func TestRateLimitMiddleware_RepeatedConstructionStartsNoGoroutine(t *testing.T) {
	t.Parallel()

	before := goroutinesStartedByMiddlewares(t)

	for range 1000 {
		handler := middlewares.RateLimitMiddleware(
			middlewares.WithRateLimiterRequestsPerMinute(1),
			middlewares.WithRateLimiterWindowSize(time.Millisecond),
		)

		// Serve a request, so the limiter has an entry to evict later.
		req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil)
		result := handler(&httpfx.Context{ //nolint:exhaustruct
			Request:        req,
			ResponseWriter: httptest.NewRecorder(),
		})
		require.Equal(t, http.StatusNoContent, result.StatusCode())
	}

	assert.Equal(t, before, goroutinesStartedByMiddlewares(t), "goroutines started by the middlewares package")
}

// Limiters built with the same options are separate: one handler's count
// never spends another's budget.
func TestRateLimitMiddleware_LimitersAreIndependent(t *testing.T) {
	t.Parallel()

	options := []middlewares.RateLimitOption{
		middlewares.WithRateLimiterRequestsPerMinute(1),
		middlewares.WithRateLimiterWindowSize(time.Minute),
		middlewares.WithRateLimiterKeyFunc(func(*httpfx.Context) string { return "shared-key" }),
	}

	first := middlewares.RateLimitMiddleware(options...)
	second := middlewares.RateLimitMiddleware(options...)

	send := func(handler httpfx.Handler) int {
		req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil)

		return handler(&httpfx.Context{ //nolint:exhaustruct
			Request:        req,
			ResponseWriter: httptest.NewRecorder(),
		}).StatusCode()
	}

	assert.Equal(t, http.StatusNoContent, send(first))
	assert.Equal(t, http.StatusTooManyRequests, send(first))
	assert.Equal(t, http.StatusNoContent, send(second), "the second limiter has its own count")
}

func TestRateLimitMiddleware_NonPositiveWindow(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		window time.Duration
	}{
		{name: "zero", window: 0},
		{name: "negative", window: -time.Second},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.PanicsWithValue(
				t,
				"httpfx: RateLimitMiddleware window "+tt.window.String()+
					" is not positive; pass a duration such as time.Minute to WithRateLimiterWindowSize",
				func() { middlewares.RateLimitMiddleware(middlewares.WithRateLimiterWindowSize(tt.window)) },
			)
		})
	}
}

package middlewares_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/httpfx/middlewares"
	"github.com/stretchr/testify/assert"
)

func TestRateLimitMiddleware(t *testing.T) { //nolint:funlen
	t.Parallel()

	t.Run("allows requests within limit", func(t *testing.T) {
		t.Parallel()

		// Create a new middleware for this test to ensure isolation
		testMiddleware := middlewares.RateLimitMiddleware(
			middlewares.WithRateLimiterRequestsPerMinute(2),
			middlewares.WithRateLimiterWindowSize(time.Minute),
			middlewares.WithRateLimiterKeyFunc(func(ctx *httpfx.Context) string {
				return "test-key-allows"
			}),
		)

		// First request should be allowed
		req1 := httptest.NewRequest(http.MethodGet, "/test", nil)
		w1 := httptest.NewRecorder() //nolint:varnamelen
		ctx1 := &httpfx.Context{
			Request:        req1,
			ResponseWriter: w1,
			Results:        httpfx.Results{},
		}

		result1 := testMiddleware(ctx1)
		assert.Equal(t, http.StatusNoContent, result1.StatusCode())
		assert.Equal(t, "1", w1.Header().Get("X-Ratelimit-Remaining"))

		// Second request should also be allowed
		req2 := httptest.NewRequest(http.MethodGet, "/test", nil)
		w2 := httptest.NewRecorder() //nolint:varnamelen
		ctx2 := &httpfx.Context{
			Request:        req2,
			ResponseWriter: w2,
			Results:        httpfx.Results{},
		}

		result2 := testMiddleware(ctx2)
		assert.Equal(t, http.StatusNoContent, result2.StatusCode())
		assert.Equal(t, "0", w2.Header().Get("X-Ratelimit-Remaining"))
	})

	t.Run("blocks requests exceeding limit", func(t *testing.T) {
		t.Parallel()

		// Create a new middleware for this test to ensure isolation
		testMiddleware := middlewares.RateLimitMiddleware(
			middlewares.WithRateLimiterRequestsPerMinute(1), // Use limit of 1 for easier testing
			middlewares.WithRateLimiterWindowSize(time.Minute),
			middlewares.WithRateLimiterKeyFunc(func(ctx *httpfx.Context) string {
				return "test-key-blocks"
			}),
		)

		// First request should be allowed
		req1 := httptest.NewRequest(http.MethodGet, "/test", nil)
		w1 := httptest.NewRecorder()
		ctx1 := &httpfx.Context{
			Request:        req1,
			ResponseWriter: w1,
			Results:        httpfx.Results{},
		}

		result1 := testMiddleware(ctx1)
		assert.Equal(t, http.StatusNoContent, result1.StatusCode())

		// Second request should be blocked
		req2 := httptest.NewRequest(http.MethodGet, "/test", nil)
		w2 := httptest.NewRecorder() //nolint:varnamelen
		ctx2 := &httpfx.Context{
			Request:        req2,
			ResponseWriter: w2,
			Results:        httpfx.Results{},
		}

		result2 := testMiddleware(ctx2)
		assert.Equal(t, http.StatusTooManyRequests, result2.StatusCode())
		assert.Contains(t, string(result2.Body()), "Rate limit exceeded")
		assert.NotEmpty(t, w2.Header().Get("Retry-After"))
	})

	t.Run("sets correct headers", func(t *testing.T) {
		t.Parallel()

		// Create new middleware to reset rate limiter
		headerMiddleware := middlewares.RateLimitMiddleware(
			middlewares.WithRateLimiterRequestsPerMinute(5),
			middlewares.WithRateLimiterWindowSize(time.Minute),
			middlewares.WithRateLimiterKeyFunc(func(ctx *httpfx.Context) string {
				return "test-key-headers"
			}),
		)

		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		responseRecorder := httptest.NewRecorder()
		ctx := &httpfx.Context{
			Request:        req,
			ResponseWriter: responseRecorder,
			Results:        httpfx.Results{},
		}

		_ = headerMiddleware(ctx)

		assert.Equal(t, "5", responseRecorder.Header().Get("X-Ratelimit-Limit"))
		assert.Equal(t, "4", responseRecorder.Header().Get("X-Ratelimit-Remaining"))
		assert.NotEmpty(t, responseRecorder.Header().Get("X-Ratelimit-Reset"))
	})
}

func TestRateLimitByIPMiddleware(t *testing.T) {
	t.Parallel()

	t.Run("limits by IP address", func(t *testing.T) {
		t.Parallel()

		// Create a specific middleware for this test to ensure isolation
		middleware := middlewares.RateLimitMiddleware(
			middlewares.WithRateLimiterRequestsPerMinute(1), // Allow only 1 request per minute
			middlewares.WithRateLimiterWindowSize(time.Minute),
			middlewares.WithRateLimiterKeyFunc(func(ctx *httpfx.Context) string {
				return "ip-test-" + ctx.Request.RemoteAddr // Rate limit by IP address
			}),
		)

		// First request from IP 192.168.1.1
		req1 := httptest.NewRequest(http.MethodGet, "/test", nil)
		req1.RemoteAddr = "192.168.1.1:12345"
		w1 := httptest.NewRecorder()
		ctx1 := &httpfx.Context{
			Request:        req1,
			ResponseWriter: w1,
			Results:        httpfx.Results{},
		}

		result1 := middleware(ctx1)
		assert.Equal(t, http.StatusNoContent, result1.StatusCode())

		// Second request from same IP should be blocked
		req2 := httptest.NewRequest(http.MethodGet, "/test", nil)
		req2.RemoteAddr = "192.168.1.1:12345"
		w2 := httptest.NewRecorder()
		ctx2 := &httpfx.Context{
			Request:        req2,
			ResponseWriter: w2,
			Results:        httpfx.Results{},
		}

		result2 := middleware(ctx2)
		assert.Equal(t, http.StatusTooManyRequests, result2.StatusCode())

		// Request from different IP should be allowed
		req3 := httptest.NewRequest(http.MethodGet, "/test", nil)
		req3.RemoteAddr = "192.168.1.2:12345"
		w3 := httptest.NewRecorder()
		ctx3 := &httpfx.Context{
			Request:        req3,
			ResponseWriter: w3,
			Results:        httpfx.Results{},
		}

		result3 := middleware(ctx3)
		assert.Equal(t, http.StatusNoContent, result3.StatusCode())
	})
}

func TestRateLimitByUserMiddleware(t *testing.T) {
	t.Parallel()

	userIDExtractor := func(ctx *httpfx.Context) string {
		userID := ctx.Request.Header.Get("X-User-Id")
		if userID == "" {
			return "anonymous"
		}

		return "user-test-" + userID // Add prefix for test isolation
	}

	// Allow only 1 request per minute
	middleware := middlewares.RateLimitMiddleware(
		middlewares.WithRateLimiterRequestsPerMinute(1),
		middlewares.WithRateLimiterKeyFunc(userIDExtractor),
	)

	t.Run("limits by user ID", func(t *testing.T) {
		t.Parallel()

		// First request from user1
		req1 := httptest.NewRequest(http.MethodGet, "/test", nil)
		req1.Header.Set("X-User-Id", "user1")

		w1 := httptest.NewRecorder()
		ctx1 := &httpfx.Context{
			Request:        req1,
			ResponseWriter: w1,
			Results:        httpfx.Results{},
		}

		result1 := middleware(ctx1)
		assert.Equal(t, http.StatusNoContent, result1.StatusCode())

		// Second request from same user should be blocked
		req2 := httptest.NewRequest(http.MethodGet, "/test", nil)
		req2.Header.Set("X-User-Id", "user1")

		w2 := httptest.NewRecorder()
		ctx2 := &httpfx.Context{
			Request:        req2,
			ResponseWriter: w2,
			Results:        httpfx.Results{},
		}

		result2 := middleware(ctx2)
		assert.Equal(t, http.StatusTooManyRequests, result2.StatusCode())

		// Request from different user should be allowed
		req3 := httptest.NewRequest(http.MethodGet, "/test", nil)
		req3.Header.Set("X-User-Id", "user2")

		w3 := httptest.NewRecorder()
		ctx3 := &httpfx.Context{
			Request:        req3,
			ResponseWriter: w3,
			Results:        httpfx.Results{},
		}

		result3 := middleware(ctx3)
		assert.Equal(t, http.StatusNoContent, result3.StatusCode())
	})
}

func TestRateLimitMiddlewareWithDefaults(t *testing.T) {
	t.Parallel()

	// Test with default options
	middleware := middlewares.RateLimitMiddleware()

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.RemoteAddr = "192.168.1.100:12345"
	responseRecorder := httptest.NewRecorder()
	ctx := &httpfx.Context{
		Request:        req,
		ResponseWriter: responseRecorder,
		Results:        httpfx.Results{},
	}

	result := middleware(ctx)
	assert.Equal(t, http.StatusNoContent, result.StatusCode())
	assert.Equal(t, "60", responseRecorder.Header().Get("X-Ratelimit-Limit"))
	assert.Equal(t, "59", responseRecorder.Header().Get("X-Ratelimit-Remaining"))
}

func TestRateLimitWithIPKeyFunc(t *testing.T) {
	t.Parallel()

	// Test using the WithIPKeyFunc helper
	middleware := middlewares.RateLimitMiddleware(
		middlewares.WithRateLimiterRequestsPerMinute(1),
		middlewares.WithRateLimiterIPKeyFunc(),
	)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.RemoteAddr = "192.168.1.200:12345"
	responseRecorder := httptest.NewRecorder()
	ctx := &httpfx.Context{
		Request:        req,
		ResponseWriter: responseRecorder,
		Results:        httpfx.Results{},
	}

	result := middleware(ctx)
	assert.Equal(t, http.StatusNoContent, result.StatusCode())
	assert.Equal(t, "1", responseRecorder.Header().Get("X-Ratelimit-Limit"))
	assert.Equal(t, "0", responseRecorder.Header().Get("X-Ratelimit-Remaining"))
}

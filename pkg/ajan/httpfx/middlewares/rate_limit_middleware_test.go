package middlewares_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/synctest"
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

func TestRateLimitLoopbackBypass(t *testing.T) { //nolint:funlen // one table of cases
	t.Parallel()

	tests := []struct {
		name           string
		skipLoopback   bool
		remoteAddr     string
		resolvedAddr   string
		wantSecondCode int
	}{
		{
			name:           "IPv4 loopback is limited by default",
			remoteAddr:     "127.0.0.1:40000",
			wantSecondCode: http.StatusTooManyRequests,
		},
		{
			name:           "IPv6 loopback is limited by default",
			remoteAddr:     "[::1]:40000",
			wantSecondCode: http.StatusTooManyRequests,
		},
		{
			name:           "IPv4 loopback skips the limit when opted in",
			skipLoopback:   true,
			remoteAddr:     "127.0.0.1:40000",
			wantSecondCode: http.StatusNoContent,
		},
		{
			name:           "other loopback address skips the limit when opted in",
			skipLoopback:   true,
			remoteAddr:     "127.0.0.2:40000",
			wantSecondCode: http.StatusNoContent,
		},
		{
			name:           "IPv6 loopback skips the limit when opted in",
			skipLoopback:   true,
			remoteAddr:     "[::1]:40000",
			wantSecondCode: http.StatusNoContent,
		},
		{
			name:           "remote peer is limited when opted in",
			skipLoopback:   true,
			remoteAddr:     "192.0.2.10:40000",
			wantSecondCode: http.StatusTooManyRequests,
		},
		{
			name:           "forwarded loopback address does not skip the limit",
			skipLoopback:   true,
			remoteAddr:     "192.0.2.10:40000",
			resolvedAddr:   "127.0.0.1",
			wantSecondCode: http.StatusTooManyRequests,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			options := []middlewares.RateLimitOption{
				middlewares.WithRateLimiterRequestsPerMinute(1),
				middlewares.WithRateLimiterWindowSize(time.Minute),
			}
			if tt.skipLoopback {
				options = append(options, middlewares.WithRateLimiterSkipLoopback())
			}

			middleware := middlewares.RateLimitMiddleware(options...)

			send := func() (httpfx.Result, http.Header) {
				req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/test", nil)
				req.RemoteAddr = tt.remoteAddr

				if tt.resolvedAddr != "" {
					req = req.WithContext(
						context.WithValue(req.Context(), middlewares.ClientAddr, tt.resolvedAddr),
					)
				}

				recorder := httptest.NewRecorder()
				ctx := &httpfx.Context{ //nolint:exhaustruct
					Request:        req,
					ResponseWriter: recorder,
				}

				return middleware(ctx), recorder.Header()
			}

			first, _ := send()
			assert.Equal(t, http.StatusNoContent, first.StatusCode())

			second, headers := send()
			assert.Equal(t, tt.wantSecondCode, second.StatusCode())

			if tt.wantSecondCode == http.StatusNoContent {
				assert.Empty(t, headers.Get("X-Ratelimit-Limit"), "skipped requests carry no limit headers")
			}
		})
	}
}

// A refused client is told to retry when its window resets, rounded up to a
// whole second, and after that wait it is allowed again. The clock is the
// synctest bubble's, so the minute passes at once.
func TestRateLimitMiddleware_RetryAfter(t *testing.T) {
	t.Parallel()

	synctest.Test(t, func(t *testing.T) {
		middleware := middlewares.RateLimitMiddleware(
			middlewares.WithRateLimiterRequestsPerMinute(1),
			middlewares.WithRateLimiterWindowSize(time.Minute),
		)

		send := func() (int, http.Header) {
			req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/test", nil)
			req.RemoteAddr = "198.51.100.7:40000"

			recorder := httptest.NewRecorder()
			result := middleware(&httpfx.Context{ //nolint:exhaustruct
				Request:        req,
				ResponseWriter: recorder,
			})

			return result.StatusCode(), recorder.Header()
		}

		status, _ := send()
		assert.Equal(t, http.StatusNoContent, status)

		time.Sleep(20*time.Second + 500*time.Millisecond)

		status, headers := send()
		assert.Equal(t, http.StatusTooManyRequests, status)
		assert.Equal(t, "40", headers.Get("Retry-After"), "39.5s rounded up")

		time.Sleep(40 * time.Second)

		status, _ = send()
		assert.Equal(t, http.StatusNoContent, status, "allowed again once the window has reset")
	})
}

// The address keys group IPv6 clients by prefix, a /64 unless
// WithRateLimiterIPv6Prefix sets another, so a client cannot reset its count
// by moving to another address of its network. IPv4 clients are counted per
// address.
func TestRateLimitMiddleware_GroupsIPv6ByPrefix(t *testing.T) { //nolint:funlen // one table of cases
	t.Parallel()

	tests := []struct {
		name           string
		options        []middlewares.RateLimitOption
		firstAddr      string
		secondAddr     string
		resolved       bool // the addresses come from ResolveAddressMiddleware
		wantSecondCode int
	}{
		{
			name:           "same /64 shares a count",
			firstAddr:      "[2001:db8:1:2::1]:40000",
			secondAddr:     "[2001:db8:1:2:ffff::2]:40001",
			wantSecondCode: http.StatusTooManyRequests,
		},
		{
			name:           "another /64 has its own count",
			firstAddr:      "[2001:db8:1:2::1]:40000",
			secondAddr:     "[2001:db8:1:3::1]:40000",
			wantSecondCode: http.StatusNoContent,
		},
		{
			name:           "resolved client addresses are grouped too",
			firstAddr:      "2001:db8:1:2::1",
			secondAddr:     "2001:db8:1:2::2",
			resolved:       true,
			wantSecondCode: http.StatusTooManyRequests,
		},
		{
			name:           "a /128 counts each address",
			options:        []middlewares.RateLimitOption{middlewares.WithRateLimiterIPv6Prefix(128)},
			firstAddr:      "[2001:db8:1:2::1]:40000",
			secondAddr:     "[2001:db8:1:2::2]:40000",
			wantSecondCode: http.StatusNoContent,
		},
		{
			name:           "a /48 groups the /64s in it",
			options:        []middlewares.RateLimitOption{middlewares.WithRateLimiterIPv6Prefix(48)},
			firstAddr:      "[2001:db8:1:2::1]:40000",
			secondAddr:     "[2001:db8:1:3::1]:40000",
			wantSecondCode: http.StatusTooManyRequests,
		},
		{
			name: "the socket peer key function groups by the prefix set after it",
			options: []middlewares.RateLimitOption{
				middlewares.WithRateLimiterIPKeyFunc(),
				middlewares.WithRateLimiterIPv6Prefix(128),
			},
			firstAddr:      "[2001:db8:1:2::1]:40000",
			secondAddr:     "[2001:db8:1:2::2]:40000",
			wantSecondCode: http.StatusNoContent,
		},
		{
			name:           "the socket peer key function groups by /64",
			options:        []middlewares.RateLimitOption{middlewares.WithRateLimiterIPKeyFunc()},
			firstAddr:      "[2001:db8:1:2::1]:40000",
			secondAddr:     "[2001:db8:1:2::2]:40000",
			wantSecondCode: http.StatusTooManyRequests,
		},
		{
			name:           "IPv4 clients are counted per address",
			firstAddr:      "198.51.100.1:40000",
			secondAddr:     "198.51.100.2:40000",
			wantSecondCode: http.StatusNoContent,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			options := append([]middlewares.RateLimitOption{
				middlewares.WithRateLimiterRequestsPerMinute(1),
				middlewares.WithRateLimiterWindowSize(time.Minute),
			}, tt.options...)

			middleware := middlewares.RateLimitMiddleware(options...)

			send := func(addr string) int {
				req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/test", nil)
				req.RemoteAddr = "192.0.2.10:40000"

				if tt.resolved {
					req = req.WithContext(context.WithValue(req.Context(), middlewares.ClientAddr, addr))
				} else {
					req.RemoteAddr = addr
				}

				return middleware(&httpfx.Context{ //nolint:exhaustruct
					Request:        req,
					ResponseWriter: httptest.NewRecorder(),
				}).StatusCode()
			}

			assert.Equal(t, http.StatusNoContent, send(tt.firstAddr))
			assert.Equal(t, tt.wantSecondCode, send(tt.secondAddr))
		})
	}
}

func TestRateLimitMiddleware_InvalidKeySettings(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		option    middlewares.RateLimitOption
		wantPanic string
	}{
		{
			name:      "zero keys",
			option:    middlewares.WithRateLimiterMaxKeys(0),
			wantPanic: "httpfx: RateLimitMiddleware key limit 0 is not positive; pass a count such as 100000 to WithRateLimiterMaxKeys",
		},
		{
			name:      "negative keys",
			option:    middlewares.WithRateLimiterMaxKeys(-1),
			wantPanic: "httpfx: RateLimitMiddleware key limit -1 is not positive; pass a count such as 100000 to WithRateLimiterMaxKeys",
		},
		{
			name:      "a /0 prefix",
			option:    middlewares.WithRateLimiterIPv6Prefix(0),
			wantPanic: "httpfx: RateLimitMiddleware IPv6 prefix /0 is outside 1 to 128 bits; pass a length such as 64 to WithRateLimiterIPv6Prefix",
		},
		{
			name:      "a prefix longer than an address",
			option:    middlewares.WithRateLimiterIPv6Prefix(129),
			wantPanic: "httpfx: RateLimitMiddleware IPv6 prefix /129 is outside 1 to 128 bits; pass a length such as 64 to WithRateLimiterIPv6Prefix",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.PanicsWithValue(t, tt.wantPanic, func() { middlewares.RateLimitMiddleware(tt.option) })
		})
	}
}

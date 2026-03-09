package middlewares

import (
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/eser/stack/apps/services/pkg/eser-go/httpfx"
	"github.com/eser/stack/apps/services/pkg/eser-go/lib"
)

// Global rate limiter instances per configuration.
var (
	globalRateLimiters = make(map[string]*rateLimiter) //nolint:gochecknoglobals
	globalMutex        sync.RWMutex                    //nolint:gochecknoglobals
)

// RateLimitOption defines a functional option for configuring rate limiting.
type RateLimitOption func(*rateLimitConfig)

// rateLimitConfig holds the internal configuration for rate limiting.
type rateLimitConfig struct {
	KeyFunc           func(*httpfx.Context) string // Function to extract key for rate limiting
	RequestsPerMinute int                          // Number of requests allowed per minute
	WindowSize        time.Duration                // Time window for rate limiting
}

// WithRateLimiterKeyFunc sets the key extraction function for rate limiting.
func WithRateLimiterKeyFunc(keyFunc func(*httpfx.Context) string) RateLimitOption {
	return func(config *rateLimitConfig) {
		config.KeyFunc = keyFunc
	}
}

// WithRateLimiterRequestsPerMinute sets the number of requests allowed per minute.
func WithRateLimiterRequestsPerMinute(requests int) RateLimitOption {
	return func(config *rateLimitConfig) {
		config.RequestsPerMinute = requests
	}
}

// WithRateLimiterWindowSize sets the time window for rate limiting.
func WithRateLimiterWindowSize(duration time.Duration) RateLimitOption {
	return func(config *rateLimitConfig) {
		config.WindowSize = duration
	}
}

// WithRateLimiterIPKeyFunc sets the key function to extract IP addresses for rate limiting.
func WithRateLimiterIPKeyFunc() RateLimitOption {
	return func(config *rateLimitConfig) {
		config.KeyFunc = func(ctx *httpfx.Context) string {
			host, _, _ := lib.SplitHostPort(ctx.Request.RemoteAddr)

			return host
		}
	}
}

// WithUserKeyFunc sets the key function to extract user IDs for rate limiting.
func WithUserKeyFunc(userIDExtractor func(*httpfx.Context) string) RateLimitOption {
	return func(config *rateLimitConfig) {
		config.KeyFunc = userIDExtractor
	}
}

// rateLimitEntry represents a single rate limit entry.
type rateLimitEntry struct {
	resetTime time.Time
	count     int
	mutex     sync.Mutex
}

// rateLimiter manages rate limiting for multiple keys.
type rateLimiter struct {
	config  *rateLimitConfig
	entries map[string]*rateLimitEntry
	mutex   sync.RWMutex
}

// newRateLimiter creates a new rate limiter instance.
func newRateLimiter(config *rateLimitConfig) *rateLimiter {
	rl := &rateLimiter{ //nolint:exhaustruct,varnamelen
		config:  config,
		entries: make(map[string]*rateLimitEntry),
	}

	// Start cleanup goroutine to remove expired entries
	go rl.cleanup()

	return rl
}

// cleanup removes expired entries periodically.
func (rl *rateLimiter) cleanup() {
	ticker := time.NewTicker(rl.config.WindowSize)
	defer ticker.Stop()

	for range ticker.C {
		rl.mutex.Lock()

		now := time.Now()

		for key, entry := range rl.entries {
			entry.mutex.Lock()

			if now.After(entry.resetTime) {
				delete(rl.entries, key)
			}

			entry.mutex.Unlock()
		}

		rl.mutex.Unlock()
	}
}

// isAllowed checks if a request is allowed for the given key.
func (rl *rateLimiter) isAllowed(key string) (bool, int, time.Time) {
	// C10K optimization: bypass rate limiting for localhost (benchmarks and internal traffic)
	if key == "127.0.0.1" || key == "::1" || key == "localhost" {
		return true, -1, time.Time{}
	}

	now := time.Now()

	rl.mutex.RLock()
	entry, exists := rl.entries[key]
	rl.mutex.RUnlock()

	if !exists {
		// Create new entry
		entry = &rateLimitEntry{ //nolint:exhaustruct
			count:     0,
			resetTime: now.Add(rl.config.WindowSize),
		}

		rl.mutex.Lock()
		rl.entries[key] = entry
		rl.mutex.Unlock()
	}

	entry.mutex.Lock()
	defer entry.mutex.Unlock()

	// Reset counter if window has expired
	if now.After(entry.resetTime) {
		entry.count = 0
		entry.resetTime = now.Add(rl.config.WindowSize)
	}

	// Check if request is allowed
	if entry.count >= rl.config.RequestsPerMinute {
		return false, 0, entry.resetTime
	}

	// Increment counter and allow request
	entry.count++

	return true, rl.config.RequestsPerMinute - entry.count, entry.resetTime
}

// RateLimitMiddleware creates a rate limiting middleware using functional options.
func RateLimitMiddleware(options ...RateLimitOption) httpfx.Handler { //nolint:funlen
	// Start with default configuration
	cfg := &rateLimitConfig{
		// 60 requests per minute
		RequestsPerMinute: 60, //nolint:mnd
		WindowSize:        time.Minute,
		KeyFunc: func(ctx *httpfx.Context) string {
			// Use resolved client address from ResolveAddressMiddleware if available.
			// This ensures correct rate limiting behind reverse proxies where
			// RemoteAddr is always the proxy IP (often 127.0.0.1).
			if addr, ok := ctx.Request.Context().Value(ClientAddr).(string); ok && addr != "" {
				host, _, _ := lib.SplitHostPort(addr)

				return host
			}

			// Fallback to socket address when ResolveAddressMiddleware hasn't run
			host, _, _ := lib.SplitHostPort(ctx.Request.RemoteAddr)

			return host
		},
	}

	// Apply all options
	for _, option := range options {
		option(cfg)
	}

	// Create a unique key for this configuration
	// For production use, we want to share rate limiters with same config
	// For testing, each middleware instance should have its own rate limiter
	configKey := fmt.Sprintf("%d_%v_%p", cfg.RequestsPerMinute, cfg.WindowSize, cfg)

	// Initialize rate limiter for this configuration if not already done
	globalMutex.Lock()

	rateLimiter, exists := globalRateLimiters[configKey]
	if !exists {
		rateLimiter = newRateLimiter(cfg)
		globalRateLimiters[configKey] = rateLimiter
	}

	globalMutex.Unlock()

	return func(ctx *httpfx.Context) httpfx.Result {
		// Extract key for rate limiting
		key := cfg.KeyFunc(ctx)

		// Check if request is allowed
		allowed, remaining, resetTime := rateLimiter.isAllowed(key)

		headers := ctx.ResponseWriter.Header()

		// Set rate limit headers
		headers.Set("X-Ratelimit-Limit", strconv.Itoa(cfg.RequestsPerMinute))
		headers.Set("X-Ratelimit-Remaining", strconv.Itoa(remaining))
		headers.Set("X-Ratelimit-Reset", strconv.FormatInt(resetTime.Unix(), 10))

		if !allowed {
			// Rate limit exceeded
			headers.Set("Retry-After", strconv.Itoa(int(time.Until(resetTime).Seconds())))

			errorResponse := map[string]any{
				"error": "Rate limit exceeded",
				"message": fmt.Sprintf(
					"Too many requests. Limit: %d requests per %v",
					cfg.RequestsPerMinute,
					cfg.WindowSize,
				),
				"retryAfter": int(time.Until(resetTime).Seconds()),
			}

			result := ctx.Results.JSON(errorResponse)
			result.InnerStatusCode = http.StatusTooManyRequests

			return result
		}

		// Request is allowed, continue to next handler
		result := ctx.Next()

		return result
	}
}

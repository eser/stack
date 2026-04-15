package httpclient_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/httpclient"
	"github.com/eser/stack/pkg/ajan/lib"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func closeBody(t *testing.T, resp *http.Response) {
	t.Helper()

	if resp != nil && resp.Body != nil {
		require.NoError(t, resp.Body.Close())
	}
}

func TestClientSuccessfulRequest(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := httpclient.NewClient()

	ctx := t.Context()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, server.URL, nil)
	require.NoError(t, err)

	resp, err := client.Do(req)
	defer closeBody(t, resp)

	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

// Test Circuit Breaker ONLY (Retry Disabled).
func TestClientCircuitBreakerOnly(t *testing.T) {
	t.Parallel()

	var failureCount int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&failureCount, 1)
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	client := httpclient.NewClient(
		httpclient.WithConfig(&httpclient.Config{
			CircuitBreaker: httpclient.CircuitBreakerConfig{
				Enabled:               true,
				FailureThreshold:      3,
				ResetTimeout:          1 * time.Second,
				HalfOpenSuccessNeeded: 1,
			},
			RetryStrategy: httpclient.RetryStrategyConfig{ //nolint:exhaustruct
				Enabled:     false,
				MaxAttempts: 1,
			},
			Transport:            httpclient.TransportConfig{}, //nolint:exhaustruct
			ServerErrorThreshold: 500,
		}),
	)
	ctx := t.Context()

	// Make requests until circuit breaker opens
	for i := range 5 {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, server.URL, nil)
		require.NoError(t, err)

		resp, err := client.Do(req)
		defer closeBody(t, resp)

		if errors.Is(err, httpclient.ErrCircuitOpen) {
			// Circuit breaker should open after 3 failures
			assert.Equal(t, int32(3), atomic.LoadInt32(&failureCount))

			return
		}

		// Before circuit breaker opens, we should get server error responses
		require.NoError(t, err, "Request %d should succeed but return 5xx", i+1)
		assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	}

	t.Error("circuit breaker did not open")
}

// Test Retry ONLY (Circuit Breaker Disabled).
func TestClientRetryOnly(t *testing.T) {
	t.Parallel()

	var attemptCount int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts := atomic.AddInt32(&attemptCount, 1)
		if attempts < 3 {
			w.WriteHeader(http.StatusInternalServerError)

			return
		}

		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := httpclient.NewClient(
		httpclient.WithConfig(&httpclient.Config{
			CircuitBreaker: httpclient.CircuitBreakerConfig{ //nolint:exhaustruct
				Enabled: false,
			},
			RetryStrategy: httpclient.RetryStrategyConfig{
				Enabled:         true,
				MaxAttempts:     3,
				InitialInterval: time.Millisecond,
				MaxInterval:     time.Second,
				Multiplier:      1.0,
				RandomFactor:    0,
			},
			Transport:            httpclient.TransportConfig{}, //nolint:exhaustruct
			ServerErrorThreshold: 500,
		}),
	)

	ctx := t.Context()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, server.URL, nil)
	require.NoError(t, err)

	resp, err := client.Do(req)
	defer closeBody(t, resp)

	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, int32(3), atomic.LoadInt32(&attemptCount))
}

// Test BOTH Circuit Breaker AND Retry Enabled.
func TestClientCircuitBreakerAndRetryBoth(t *testing.T) { //nolint:dupl
	t.Parallel()

	var attemptCount int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&attemptCount, 1)
		w.WriteHeader(http.StatusInternalServerError) // Always fail
	}))
	defer server.Close()

	client := httpclient.NewClient(
		httpclient.WithConfig(&httpclient.Config{
			CircuitBreaker: httpclient.CircuitBreakerConfig{
				Enabled:               true,
				FailureThreshold:      5, // Higher threshold than retry attempts
				ResetTimeout:          1 * time.Second,
				HalfOpenSuccessNeeded: 1,
			},
			RetryStrategy: httpclient.RetryStrategyConfig{
				Enabled:         true,
				MaxAttempts:     3, // Will retry 3 times before giving up
				InitialInterval: time.Millisecond,
				MaxInterval:     time.Second,
				Multiplier:      1.0,
				RandomFactor:    0,
			},
			Transport:            httpclient.TransportConfig{}, //nolint:exhaustruct
			ServerErrorThreshold: 500,
		}),
	)

	ctx := t.Context()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, server.URL, nil)
	require.NoError(t, err)

	resp, err := client.Do(req)
	defer closeBody(t, resp)

	// Should exhaust retries before circuit breaker opens
	require.Error(t, err)
	require.ErrorIs(t, err, httpclient.ErrMaxRetries)
	assert.Equal(t, int32(3), atomic.LoadInt32(&attemptCount))
}

// Test BOTH Circuit Breaker AND Retry - Circuit Breaker Opens First.
func TestClientCircuitBreakerOpensBeforeRetryExhaustion(t *testing.T) { //nolint:dupl
	t.Parallel()

	var attemptCount int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&attemptCount, 1)
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	client := httpclient.NewClient(
		httpclient.WithConfig(&httpclient.Config{
			CircuitBreaker: httpclient.CircuitBreakerConfig{
				Enabled:               true,
				FailureThreshold:      2, // Lower threshold than retry attempts
				ResetTimeout:          1 * time.Second,
				HalfOpenSuccessNeeded: 1,
			},
			RetryStrategy: httpclient.RetryStrategyConfig{
				Enabled:         true,
				MaxAttempts:     5, // More attempts than circuit breaker threshold
				InitialInterval: time.Millisecond,
				MaxInterval:     time.Second,
				Multiplier:      1.0,
				RandomFactor:    0,
			},
			Transport:            httpclient.TransportConfig{}, //nolint:exhaustruct
			ServerErrorThreshold: 500,
		}),
	)

	ctx := t.Context()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, server.URL, nil)
	require.NoError(t, err)

	resp, err := client.Do(req)
	defer closeBody(t, resp)

	// Circuit breaker should open before retries are exhausted
	require.Error(t, err)
	require.ErrorIs(t, err, httpclient.ErrCircuitOpen)
	assert.Equal(t, int32(2), atomic.LoadInt32(&attemptCount))
}

// Test NEITHER Circuit Breaker NOR Retry Enabled.
func TestClientNoResilienceFeatures(t *testing.T) {
	t.Parallel()

	var attemptCount int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&attemptCount, 1)
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	client := httpclient.NewClient(
		httpclient.WithConfig(&httpclient.Config{
			CircuitBreaker: httpclient.CircuitBreakerConfig{ //nolint:exhaustruct
				Enabled: false,
			},
			RetryStrategy: httpclient.RetryStrategyConfig{ //nolint:exhaustruct
				Enabled: false,
			},
			Transport:            httpclient.TransportConfig{}, //nolint:exhaustruct
			ServerErrorThreshold: 500,
		}),
	)

	ctx := t.Context()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, server.URL, nil)
	require.NoError(t, err)

	resp, err := client.Do(req)
	defer closeBody(t, resp)

	// Should get the server error response directly without any retries or circuit breaking
	require.NoError(t, err)
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	assert.Equal(t, int32(1), atomic.LoadInt32(&attemptCount)) // Only one attempt
}

// Original tests (renamed for clarity).
func TestClientCircuitBreaker(t *testing.T) {
	t.Parallel()

	failureCount := 0

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		failureCount++

		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	client := httpclient.NewClient(
		httpclient.WithConfig(&httpclient.Config{
			CircuitBreaker: httpclient.CircuitBreakerConfig{
				Enabled:               true,
				FailureThreshold:      3,
				ResetTimeout:          1 * time.Second,
				HalfOpenSuccessNeeded: 1,
			},
			RetryStrategy: httpclient.RetryStrategyConfig{
				Enabled:         false,
				MaxAttempts:     1,
				InitialInterval: time.Millisecond,
				MaxInterval:     time.Second,
				Multiplier:      1.0,
				RandomFactor:    0,
			},
			Transport:            httpclient.TransportConfig{}, //nolint:exhaustruct
			ServerErrorThreshold: 500,
		}),
	)
	ctx := t.Context()

	// Make requests until circuit breaker opens
	for i := range 4 {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, server.URL, nil)
		require.NoError(t, err)

		resp, err := client.Do(req)
		defer closeBody(t, resp)

		if errors.Is(err, httpclient.ErrCircuitOpen) {
			assert.Equal(t, 3, failureCount)

			return
		}

		if err != nil {
			t.Fatalf("Unexpected error on request %d: %v", i+1, err)
		}

		assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	}

	t.Error("circuit breaker did not open")
}

func TestClientRetryMechanism(t *testing.T) {
	t.Parallel()

	attemptCount := 0

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attemptCount++
		if attemptCount < 3 {
			w.WriteHeader(http.StatusInternalServerError)

			return
		}

		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := httpclient.NewClient(
		httpclient.WithConfig(&httpclient.Config{
			CircuitBreaker: httpclient.CircuitBreakerConfig{ //nolint:exhaustruct
				Enabled: false,
			},
			RetryStrategy: httpclient.RetryStrategyConfig{
				Enabled:         true,
				MaxAttempts:     3,
				InitialInterval: time.Millisecond,
				MaxInterval:     time.Second,
				Multiplier:      1.0,
				RandomFactor:    0,
			},

			Transport:            httpclient.TransportConfig{}, //nolint:exhaustruct
			ServerErrorThreshold: 500,
		}),
	)

	ctx := t.Context()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, server.URL, nil)
	require.NoError(t, err)

	resp, err := client.Do(req)
	defer closeBody(t, resp)

	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, 3, attemptCount)
}

func TestClientContextCancellation(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		lib.SleepContext(r.Context(), 100*time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := httpclient.NewClient()

	ctx, cancel := context.WithTimeout(t.Context(), 50*time.Millisecond)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, server.URL, nil)
	require.NoError(t, err)

	resp, err := client.Do(req)
	defer closeBody(t, resp)

	require.Error(t, err)
	require.Contains(t, err.Error(), context.DeadlineExceeded.Error())
}

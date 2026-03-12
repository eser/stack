package httpclient

import (
	"errors"
	"fmt"
	"net/http"
	"time"
)

const (
	DefaultServerErrorThreshold = 500

	DefaultFailureThreshold = 5
	DefaultResetTimeout     = 10 * time.Second
	DefaultHalfOpenSuccess  = 2
)

var (
	// ErrCircuitOpen is returned when the circuit breaker is open.
	ErrCircuitOpen = errors.New("circuit breaker is open")
	// ErrMaxRetries is returned when max retries are exceeded.
	ErrMaxRetries = errors.New("max retries exceeded")
	// ErrRequestBodyNotRetriable is returned when request body cannot be retried.
	ErrRequestBodyNotRetriable = errors.New(
		"request body cannot be retried, implement GetBody to enable retries",
	)
	// ErrAllRetryAttemptsFailed is returned when all retry attempts fail.
	ErrAllRetryAttemptsFailed = errors.New("all retry attempts failed")
	// ErrTransportError is returned when the underlying transport fails.
	ErrTransportError = errors.New("transport error")
	// ErrRequestContextError is returned when request context is cancelled.
	ErrRequestContextError = errors.New("request context error")
)

type ResilientTransport struct {
	Transport http.RoundTripper
	Config    *Config

	CircuitBreaker *CircuitBreaker
	RetryStrategy  *RetryStrategy
}

func NewResilientTransport(
	transport http.RoundTripper,
	config *Config,
) *ResilientTransport {
	cb := NewCircuitBreaker(&config.CircuitBreaker) //nolint:varnamelen
	rs := NewRetryStrategy(&config.RetryStrategy)   //nolint:varnamelen

	return &ResilientTransport{
		Transport: transport,
		Config:    config,

		CircuitBreaker: cb,
		RetryStrategy:  rs,
	}
}

func (t *ResilientTransport) RoundTrip( //nolint:cyclop,gocognit,funlen
	req *http.Request,
) (*http.Response, error) {
	// Check circuit breaker before starting (only if enabled)
	if t.Config.CircuitBreaker.Enabled && !t.CircuitBreaker.IsAllowed() {
		return nil, ErrCircuitOpen
	}

	if req.Body != nil && req.GetBody == nil {
		return nil, ErrRequestBodyNotRetriable
	}

	var lastErr error

	var resp *http.Response

	// Determine max attempts based on retry configuration
	var maxAttempts uint
	if t.Config.RetryStrategy.Enabled {
		maxAttempts = max(t.Config.RetryStrategy.MaxAttempts, 1)
	} else {
		maxAttempts = 1
	}

	for attempt := range maxAttempts {
		// Handle retry backoff (skip on first attempt)
		if attempt > 0 && t.Config.RetryStrategy.Enabled {
			var err error

			req, err = t.handleRetry(req, attempt)
			if err != nil {
				return nil, err
			}
		}

		// Make the request
		resp, lastErr = t.handleRequest(req)

		// If request was successful, return immediately
		if lastErr == nil && resp.StatusCode < t.Config.ServerErrorThreshold {
			return resp, nil
		}

		// Check circuit breaker after failure (only if enabled)
		if t.Config.CircuitBreaker.Enabled && !t.CircuitBreaker.IsAllowed() {
			return nil, ErrCircuitOpen
		}

		// If this is the last attempt or retries are disabled, break
		if !t.Config.RetryStrategy.Enabled || attempt == maxAttempts-1 {
			break
		}
	}

	// Handle final response based on what we have
	if lastErr != nil {
		// Transport error occurred
		if t.Config.RetryStrategy.Enabled && maxAttempts > 1 {
			return nil, fmt.Errorf("%w: %w", ErrAllRetryAttemptsFailed, lastErr)
		}

		return nil, fmt.Errorf("%w: %w", ErrTransportError, lastErr)
	}

	// We have a response but it's a server error
	if resp != nil && resp.StatusCode >= t.Config.ServerErrorThreshold {
		// If retries were enabled and exhausted, return retry error
		if t.Config.RetryStrategy.Enabled && maxAttempts > 1 {
			return nil, ErrMaxRetries
		}
		// Otherwise return the server error response
		return resp, nil
	}

	// Fallback - should not reach here
	return nil, ErrMaxRetries
}

// CancelRequest implements the optional CancelRequest method for http.RoundTripper.
func (t *ResilientTransport) CancelRequest(req *http.Request) {
	type canceler interface {
		CancelRequest(req *http.Request)
	}

	if cr, ok := t.Transport.(canceler); ok {
		cr.CancelRequest(req)
	}
}

// handleRequest performs a single request attempt and handles the response.
func (t *ResilientTransport) handleRequest(req *http.Request) (*http.Response, error) {
	resp, err := t.Transport.RoundTrip(req)
	if err != nil {
		// Only notify circuit breaker if it's enabled
		if t.Config.CircuitBreaker.Enabled {
			t.CircuitBreaker.OnFailure()
		}

		return nil, fmt.Errorf("%w: %w", ErrTransportError, err)
	}

	// Check if this is a server error
	if resp.StatusCode >= t.Config.ServerErrorThreshold {
		// Only notify circuit breaker if it's enabled
		if t.Config.CircuitBreaker.Enabled {
			t.CircuitBreaker.OnFailure()
		}

		return resp, nil
	}

	// Success - notify circuit breaker if enabled
	if t.Config.CircuitBreaker.Enabled {
		t.CircuitBreaker.OnSuccess()
	}

	return resp, nil
}

// handleRetry manages the retry backoff and request cloning.
func (t *ResilientTransport) handleRetry(req *http.Request, attempt uint) (*http.Request, error) {
	backoff := t.RetryStrategy.NextBackoff(attempt)
	if backoff <= 0 {
		return nil, ErrMaxRetries
	}

	timer := time.NewTimer(backoff)
	defer timer.Stop()

	select {
	case <-req.Context().Done():
		return nil, fmt.Errorf("%w: %w", ErrRequestContextError, req.Context().Err())
	case <-timer.C:
	}

	return req.Clone(req.Context()), nil
}

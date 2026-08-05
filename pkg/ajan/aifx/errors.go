package aifx

import (
	"context"
	"errors"
	"fmt"
)

// Provider-agnostic error classification sentinels.
// Adapters wrap SDK errors with these so callers can detect error categories
// without importing provider SDKs.
//
// Error chain example: ErrOpenAIGenerationFailed -> ErrRateLimited -> <original sdk error>
// Callers check: errors.Is(err, aifx.ErrRateLimited).
var (
	ErrRateLimited         = errors.New("rate limited")
	ErrAuthFailed          = errors.New("authentication failed")
	ErrInsufficientCredits = errors.New("insufficient credits")
	ErrBadRequest          = errors.New("bad request")
	ErrServiceUnavailable  = errors.New("service unavailable")
)

// APIError carries the provider's HTTP status across package boundaries.
//
// The sentinels above survive errors.Is, but the integer that produced them did
// not survive anything: classifyAndWrap consumed statusCode and stored nothing,
// so a consumer outside this package could learn "service unavailable" and
// never learn whether that was a 500 or a 503. That is enough to log and not
// enough to act on -- and it is why an error crossing the FFI bridge arrived as
// a bare sentence.
//
// It also carries statuses classifyStatusCode has no sentinel for (404, 408,
// 413, 422), which would otherwise vanish entirely.
type APIError struct {
	// Err is the underlying error, including any classification sentinel.
	Err error

	// StatusCode is the provider's HTTP status, or 0 when there was none --
	// a local failure, or an agent-backed provider that speaks no HTTP.
	StatusCode int
}

func (e *APIError) Error() string { return e.Err.Error() }
func (e *APIError) Unwrap() error { return e.Err }

// ErrorKind returns a stable, provider-agnostic classification slug, or "" when
// the error carries no classification.
//
// These slugs are wire values: they cross the FFI bridge and are matched
// literally in TypeScript, so renaming one is a protocol change.
//
// Cancellation is reported as its own kind rather than through the sentinel it
// is wrapped with. classifyContextError maps a cancelled context to
// ErrServiceUnavailable, which is a *retryable* class -- publishing that would
// tell a caller to retry the request it just deliberately cancelled.
func ErrorKind(err error) string {
	if err == nil {
		return ""
	}

	switch {
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		return "cancelled"
	case errors.Is(err, ErrRateLimited):
		return "rate_limited"
	case errors.Is(err, ErrAuthFailed):
		return "auth_failed"
	case errors.Is(err, ErrInsufficientCredits):
		return "insufficient_credits"
	case errors.Is(err, ErrBadRequest):
		return "bad_request"
	case errors.Is(err, ErrServiceUnavailable):
		return "service_unavailable"
	default:
		return ""
	}
}

// ErrorStatus returns the provider's HTTP status, or 0 when the error carries
// none. Zero is meaningful: it says "this failure had no HTTP status", which is
// the normal case for a local error or an agent-backed provider.
func ErrorStatus(err error) int {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr.StatusCode
	}

	return 0
}

// classifyStatusCode maps an HTTP status code to a provider-agnostic sentinel.
// Returns nil if the status code does not map to a known classification.
func classifyStatusCode(statusCode int) error {
	switch statusCode {
	case 429: //nolint:mnd
		return ErrRateLimited
	case 401: //nolint:mnd
		return ErrAuthFailed
	case 402: //nolint:mnd
		return ErrInsufficientCredits
	case 400: //nolint:mnd
		return ErrBadRequest
	case 500, 503, 529: //nolint:mnd
		return ErrServiceUnavailable
	default:
		return nil
	}
}

// classifyAndWrap builds the classified error chain.
// If classification found: providerSentinel -> classifiedSentinel -> originalErr
// If not:                  providerSentinel -> originalErr.
// The status is retained in an APIError rather than discarded, so a consumer
// outside this package can still see the number that produced the sentinel --
// and can see a status that maps to no sentinel at all (404, 408, 413, 422).
func classifyAndWrap(providerSentinel error, statusCode int, originalErr error) error {
	classified := classifyStatusCode(statusCode)

	var wrapped error

	if classified != nil {
		wrapped = fmt.Errorf("%w: %w: %w", providerSentinel, classified, originalErr)
	} else {
		wrapped = fmt.Errorf("%w: %w", providerSentinel, originalErr)
	}

	if statusCode == 0 {
		return wrapped
	}

	return &APIError{Err: wrapped, StatusCode: statusCode}
}

// classifyContextError checks for context cancellation/timeout and wraps accordingly.
// Returns the wrapped error if applicable, nil otherwise.
func classifyContextError(providerSentinel error, originalErr error) error {
	if errors.Is(originalErr, context.Canceled) ||
		errors.Is(originalErr, context.DeadlineExceeded) {
		return fmt.Errorf("%w: %w: %w", providerSentinel, ErrServiceUnavailable, originalErr)
	}

	return nil
}

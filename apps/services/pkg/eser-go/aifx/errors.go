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
func classifyAndWrap(providerSentinel error, statusCode int, originalErr error) error {
	classified := classifyStatusCode(statusCode)
	if classified != nil {
		return fmt.Errorf("%w: %w: %w", providerSentinel, classified, originalErr)
	}

	return fmt.Errorf("%w: %w", providerSentinel, originalErr)
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

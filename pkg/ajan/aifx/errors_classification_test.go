package aifx

import (
	"context"
	"errors"
	"fmt"
	"testing"
)

// The property under test is that a provider failure keeps enough information
// to act on after it leaves this package. Before, classifyAndWrap consumed the
// HTTP status and stored nothing, so a consumer could learn "service
// unavailable" and never learn whether that was a 500 or a 503.

func TestClassifyAndWrapKeepsTheStatus(t *testing.T) {
	t.Parallel()

	sentinel := errors.New("provider failed")

	cases := []struct {
		status int
		kind   string
	}{
		{status: 429, kind: "rate_limited"},
		{status: 401, kind: "auth_failed"},
		{status: 402, kind: "insufficient_credits"},
		{status: 400, kind: "bad_request"},
		{status: 503, kind: "service_unavailable"},
		// No sentinel maps to these, and they used to vanish entirely. The
		// status still has to survive so a caller can see a 404.
		{status: 404, kind: ""},
		{status: 422, kind: ""},
	}

	for _, tc := range cases {
		err := classifyAndWrap(sentinel, tc.status, errors.New("boom"))

		if got := ErrorStatus(err); got != tc.status {
			t.Fatalf("status %d survived as %d", tc.status, got)
		}

		if got := ErrorKind(err); got != tc.kind {
			t.Fatalf("status %d classified as %q, want %q", tc.status, got, tc.kind)
		}

		// The sentinel chain must still work: this is the in-process contract
		// every existing caller relies on.
		if !errors.Is(err, sentinel) {
			t.Fatalf("status %d lost its provider sentinel", tc.status)
		}
	}
}

// TestNoStatusStaysUnwrapped pins that a local failure is not dressed up as an
// HTTP one. An agent-backed provider, a binary that is missing, a decode error
// -- none of these have a status, and reporting 0 as though it were one would
// be worse than reporting nothing.
func TestNoStatusStaysUnwrapped(t *testing.T) {
	t.Parallel()

	err := classifyAndWrap(errors.New("provider failed"), 0, errors.New("boom"))

	if got := ErrorStatus(err); got != 0 {
		t.Fatalf("a statusless error reported status %d", got)
	}

	var apiErr *APIError
	if errors.As(err, &apiErr) {
		t.Fatal("a statusless error was wrapped in an APIError")
	}
}

// TestCancellationIsNotReportedAsRetryable is the subtle one.
//
// classifyContextError wraps a cancelled context with ErrServiceUnavailable,
// which is a *retryable* class. Publishing that verbatim would tell a caller to
// retry the request they just deliberately cancelled -- strictly worse than the
// unclassified error they got before.
func TestCancellationIsNotReportedAsRetryable(t *testing.T) {
	t.Parallel()

	wrapped := classifyContextError(errors.New("provider failed"), context.Canceled)
	if wrapped == nil {
		t.Fatal("classifyContextError did not recognise a cancelled context")
	}

	// It really is wrapped with the retryable sentinel...
	if !errors.Is(wrapped, ErrServiceUnavailable) {
		t.Fatal("test premise is stale: cancellation is no longer wrapped as unavailable")
	}

	// ...and ErrorKind must still not say so.
	if got := ErrorKind(wrapped); got != "cancelled" {
		t.Fatalf("cancellation reported as %q, want cancelled", got)
	}

	if got := ErrorKind(fmt.Errorf("wrapped: %w", context.DeadlineExceeded)); got != "cancelled" {
		t.Fatalf("deadline exceeded reported as %q, want cancelled", got)
	}
}

func TestErrorKindIsEmptyForUnclassifiedErrors(t *testing.T) {
	t.Parallel()

	if got := ErrorKind(nil); got != "" {
		t.Fatalf("nil classified as %q", got)
	}

	if got := ErrorKind(errors.New("some local problem")); got != "" {
		t.Fatalf("an unclassified error reported kind %q", got)
	}

	if got := ErrorStatus(errors.New("some local problem")); got != 0 {
		t.Fatalf("an unclassified error reported status %d", got)
	}
}

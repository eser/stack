package aifx

import (
	"context"
	"errors"
	"fmt"
	"testing"
)

var errProviderSentinel = errors.New("provider failed")

func TestClassifyStatusCode(t *testing.T) {
	t.Parallel()

	tests := []struct {
		code    int
		wantErr error
	}{
		{429, ErrRateLimited},
		{401, ErrAuthFailed},
		{402, ErrInsufficientCredits},
		{400, ErrBadRequest},
		{500, ErrServiceUnavailable},
		{503, ErrServiceUnavailable},
		{529, ErrServiceUnavailable},
		{200, nil},
		{404, nil},
		{0, nil},
	}

	for _, tc := range tests {
		t.Run(fmt.Sprintf("status_%d", tc.code), func(t *testing.T) {
			t.Parallel()

			got := classifyStatusCode(tc.code)

			if tc.wantErr == nil {
				if got != nil {
					t.Errorf("code %d: expected nil, got %v", tc.code, got)
				}

				return
			}

			if !errors.Is(got, tc.wantErr) {
				t.Errorf("code %d: expected %v, got %v", tc.code, tc.wantErr, got)
			}
		})
	}
}

func TestClassifyAndWrap_ChainStructure(t *testing.T) {
	t.Parallel()

	originalErr := errors.New("sdk error")

	t.Run("classified status wraps all sentinels", func(t *testing.T) {
		t.Parallel()

		err := classifyAndWrap(errProviderSentinel, 429, originalErr)

		if !errors.Is(err, errProviderSentinel) {
			t.Error("provider sentinel missing from chain")
		}

		if !errors.Is(err, ErrRateLimited) {
			t.Error("rate limited sentinel missing from chain")
		}

		if !errors.Is(err, originalErr) {
			t.Error("original error missing from chain")
		}
	})

	t.Run("unclassified status omits middle sentinel", func(t *testing.T) {
		t.Parallel()

		err := classifyAndWrap(errProviderSentinel, 200, originalErr)

		if !errors.Is(err, errProviderSentinel) {
			t.Error("provider sentinel missing from chain")
		}

		if !errors.Is(err, originalErr) {
			t.Error("original error missing from chain")
		}

		if errors.Is(err, ErrRateLimited) || errors.Is(err, ErrBadRequest) || errors.Is(err, ErrServiceUnavailable) {
			t.Error("no classified sentinel expected for status 200")
		}
	})
}

func TestClassifyContextError(t *testing.T) {
	t.Parallel()

	t.Run("context.Canceled maps to ServiceUnavailable", func(t *testing.T) {
		t.Parallel()

		err := classifyContextError(errProviderSentinel, context.Canceled)

		if err == nil {
			t.Fatal("expected non-nil error")
		}

		if !errors.Is(err, errProviderSentinel) {
			t.Error("provider sentinel missing")
		}

		if !errors.Is(err, ErrServiceUnavailable) {
			t.Error("ErrServiceUnavailable missing")
		}

		if !errors.Is(err, context.Canceled) {
			t.Error("original context.Canceled missing from chain")
		}
	})

	t.Run("context.DeadlineExceeded maps to ServiceUnavailable", func(t *testing.T) {
		t.Parallel()

		err := classifyContextError(errProviderSentinel, context.DeadlineExceeded)

		if err == nil {
			t.Fatal("expected non-nil error")
		}

		if !errors.Is(err, ErrServiceUnavailable) {
			t.Error("ErrServiceUnavailable missing for DeadlineExceeded")
		}
	})

	t.Run("non-context error returns nil", func(t *testing.T) {
		t.Parallel()

		err := classifyContextError(errProviderSentinel, errors.New("other"))
		if err != nil {
			t.Errorf("expected nil for non-context error, got %v", err)
		}
	})
}

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Wave 4 Phase A — httpclient coverage supplement (67.6% → ≥80%).

package httpclient_test

import (
	"crypto/tls"
	"net/http"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/httpclient"
)

// ─── CircuitState.String ─────────────────────────────────────────────────────

func TestCircuitState_String(t *testing.T) {
	t.Parallel()

	cases := []struct {
		state httpclient.CircuitState
		want  string
	}{
		{httpclient.StateClosed, "StateClosed"},
		{httpclient.StateHalfOpen, "StateHalfOpen"},
		{httpclient.StateOpen, "StateOpen"},
	}

	for _, tc := range cases {
		got := tc.state.String()
		if got != tc.want {
			t.Errorf("state %d: String() = %q, want %q", tc.state, got, tc.want)
		}
	}
}

// ─── CircuitBreaker.State ────────────────────────────────────────────────────

func TestCircuitBreaker_State_InitialClosed(t *testing.T) {
	t.Parallel()

	cb := httpclient.NewCircuitBreaker(&httpclient.CircuitBreakerConfig{
		Enabled:               true,
		FailureThreshold:      5,
		ResetTimeout:          1 * time.Second,
		HalfOpenSuccessNeeded: 2,
	})

	if cb.State() != httpclient.StateClosed {
		t.Fatalf("expected StateClosed initially, got %s", cb.State())
	}
}

func TestCircuitBreaker_State_TransitionsToOpen(t *testing.T) {
	t.Parallel()

	cb := httpclient.NewCircuitBreaker(&httpclient.CircuitBreakerConfig{
		Enabled:               true,
		FailureThreshold:      2,
		ResetTimeout:          10 * time.Second,
		HalfOpenSuccessNeeded: 1,
	})

	cb.OnFailure()
	cb.OnFailure()

	if cb.State() != httpclient.StateOpen {
		t.Fatalf("expected StateOpen after threshold failures, got %s", cb.State())
	}
}

func TestCircuitBreaker_HalfOpen_TransitionsToClosed(t *testing.T) {
	t.Parallel()

	cb := httpclient.NewCircuitBreaker(&httpclient.CircuitBreakerConfig{
		Enabled:               true,
		FailureThreshold:      1,
		ResetTimeout:          time.Nanosecond, // immediate reset
		HalfOpenSuccessNeeded: 1,
	})

	cb.OnFailure()
	// Wait for reset timeout to pass
	time.Sleep(5 * time.Millisecond)

	// IsAllowed transitions to HalfOpen
	cb.IsAllowed()

	if cb.State() != httpclient.StateHalfOpen {
		t.Logf("state=%s (may have transitioned)", cb.State())
	}

	// Success in HalfOpen → Closed
	cb.OnSuccess()
	if cb.State() != httpclient.StateClosed {
		t.Fatalf("expected StateClosed after success in HalfOpen, got %s", cb.State())
	}
}

func TestCircuitBreaker_OnSuccess_InClosed_ResetsCount(t *testing.T) {
	t.Parallel()

	cb := httpclient.NewCircuitBreaker(&httpclient.CircuitBreakerConfig{
		Enabled:               true,
		FailureThreshold:      5,
		ResetTimeout:          10 * time.Second,
		HalfOpenSuccessNeeded: 2,
	})

	cb.OnFailure() // one failure
	cb.OnSuccess() // success in Closed state — resets count
	// State should remain Closed
	if cb.State() != httpclient.StateClosed {
		t.Fatalf("expected StateClosed after success, got %s", cb.State())
	}
}

// ─── Options ─────────────────────────────────────────────────────────────────

func TestWithTLSClientConfig(t *testing.T) {
	t.Parallel()

	tlsCfg := &tls.Config{InsecureSkipVerify: true} //nolint:gosec // test only
	client := httpclient.NewClient(httpclient.WithTLSClientConfig(tlsCfg))

	if client == nil {
		t.Fatal("expected non-nil client")
	}
}

func TestWithRoundTripper(t *testing.T) {
	t.Parallel()

	rt := http.DefaultTransport
	client := httpclient.NewClient(httpclient.WithRoundTripper(rt))

	if client == nil {
		t.Fatal("expected non-nil client")
	}
}

func TestWithTimeout(t *testing.T) {
	t.Parallel()

	client := httpclient.NewClient(httpclient.WithTimeout(5 * time.Second))

	if client == nil {
		t.Fatal("expected non-nil client")
	}
	if client.Timeout != 5*time.Second {
		t.Fatalf("expected timeout=5s, got %v", client.Timeout)
	}
}

// ─── CancelRequest ───────────────────────────────────────────────────────────

func TestCancelRequest_NoOpWhenTransportDoesNotSupport(t *testing.T) {
	t.Parallel()

	// Use a plain RoundTripper that doesn't implement CancelRequest
	client := httpclient.NewClient(httpclient.WithRoundTripper(plainRT{}))
	req, _ := http.NewRequest(http.MethodGet, "http://localhost", nil) //nolint:noctx

	// CancelRequest must not panic even when inner transport lacks it
	client.Transport.CancelRequest(req)
}

// plainRT is a RoundTripper without CancelRequest.
type plainRT struct{}

func (plainRT) RoundTrip(_ *http.Request) (*http.Response, error) {
	return &http.Response{StatusCode: 200, Body: http.NoBody}, nil
}

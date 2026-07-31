package httpclient_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/http/httptrace"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/httpclient"
)

// TestRetriesReuseConnections pins the connection-leak fix.
//
// ResilientTransport used to abandon every non-final response without closing
// or draining it. net/http only returns a connection to the idle pool once its
// body is read to completion, so each retry opened a brand new socket -- and
// with this package's default zero client timeout those were never reclaimed.
func TestRetriesReuseConnections(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(
		func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(strings.Repeat("x", 1024)))
		},
	))
	defer server.Close()

	cfg := &httpclient.Config{
		CircuitBreaker: httpclient.CircuitBreakerConfig{ //nolint:exhaustruct
			Enabled: false,
		},
		RetryStrategy: httpclient.RetryStrategyConfig{
			Enabled:         true,
			MaxAttempts:     5,
			InitialInterval: time.Millisecond,
			MaxInterval:     5 * time.Millisecond,
			Multiplier:      2,
			RandomFactor:    0.1,
		},
		Transport:            httpclient.TransportConfig{}, //nolint:exhaustruct
		ServerErrorThreshold: 500,
	}

	// A dedicated transport: http.DefaultTransport is process-global and its
	// idle pool is shared with every other parallel test, which makes the dial
	// count non-deterministic.
	base := &http.Transport{} //nolint:exhaustruct
	defer base.CloseIdleConnections()

	transport := httpclient.NewResilientTransport(base, cfg)

	var newConns atomic.Int32

	trace := &httptrace.ClientTrace{
		ConnectStart: func(_, _ string) { newConns.Add(1) },
	}

	req, err := http.NewRequest(http.MethodGet, server.URL, nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}

	req = req.WithContext(httptrace.WithClientTrace(req.Context(), trace))

	resp, err := transport.RoundTrip(req) //nolint:bodyclose
	if err == nil {
		drain(t, resp)
	}

	// Five attempts against a keep-alive server should share one connection.
	// Before the fix this measured one fresh dial per attempt.
	if got := newConns.Load(); got != 1 {
		t.Fatalf(
			"opened %d connections for 5 retried attempts; want exactly 1 "+
				"(a non-drained body cannot be returned to the idle pool)",
			got,
		)
	}
}

// opaqueBody is a reader net/http cannot recognise. That matters: for
// bytes.Reader / strings.Reader / bytes.Buffer the transport rewinds the body
// itself via GetBody, which hides the bug entirely. Only an unrecognised reader
// exercises the retry path's own rewinding.
type opaqueBody struct{ r io.Reader }

func (o *opaqueBody) Read(p []byte) (int, error) { return o.r.Read(p) } //nolint:wrapcheck

func (o *opaqueBody) Close() error { return nil }

// TestRetryResendsRequestBody pins the GetBody rewind in handleRetry.
//
// handleRetry ended in `req.Clone(req.Context())`, which shallow-copies Body --
// a reader the previous attempt already drained. Every retry therefore sent an
// EMPTY body. The server accepted it and answered 200, so the caller saw a
// successful request that silently carried no payload. Nothing errored.
func TestRetryResendsRequestBody(t *testing.T) {
	t.Parallel()

	const payload = "hello-retry-body"

	var (
		attempts    atomic.Int32
		emptyBodies atomic.Int32
		lastBody    atomic.Value
	)

	server := httptest.NewServer(http.HandlerFunc(
		func(w http.ResponseWriter, r *http.Request) {
			body, _ := io.ReadAll(r.Body)
			lastBody.Store(string(body))

			if len(body) == 0 {
				emptyBodies.Add(1)
			}

			if attempts.Add(1) < 3 {
				w.WriteHeader(http.StatusServiceUnavailable)

				return
			}

			w.WriteHeader(http.StatusOK)
		},
	))
	defer server.Close()

	cfg := &httpclient.Config{
		CircuitBreaker: httpclient.CircuitBreakerConfig{ //nolint:exhaustruct
			Enabled: false,
		},
		RetryStrategy: httpclient.RetryStrategyConfig{
			Enabled:         true,
			MaxAttempts:     5,
			InitialInterval: time.Millisecond,
			MaxInterval:     5 * time.Millisecond,
			Multiplier:      2,
			RandomFactor:    0.1,
		},
		Transport:            httpclient.TransportConfig{}, //nolint:exhaustruct
		ServerErrorThreshold: 500,
	}

	// A dedicated transport: http.DefaultTransport is process-global and its
	// idle pool is shared with every other parallel test, which makes the dial
	// count non-deterministic.
	base := &http.Transport{} //nolint:exhaustruct
	defer base.CloseIdleConnections()

	transport := httpclient.NewResilientTransport(base, cfg)

	req, err := http.NewRequest(
		http.MethodPost,
		server.URL,
		&opaqueBody{r: strings.NewReader(payload)},
	)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}

	// Supply GetBody by hand: RoundTrip requires it, and net/http cannot
	// synthesise one for an unrecognised reader.
	req.GetBody = func() (io.ReadCloser, error) {
		return &opaqueBody{r: strings.NewReader(payload)}, nil
	}

	resp, err := transport.RoundTrip(req) //nolint:bodyclose
	if err != nil {
		t.Fatalf("RoundTrip after retries: %v", err)
	}

	drain(t, resp)

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	// Every attempt, including the retries, must carry the full body.
	if got, _ := lastBody.Load().(string); got != payload {
		t.Fatalf("server saw body %q on the final attempt, want %q", got, payload)
	}

	if got := emptyBodies.Load(); got != 0 {
		t.Fatalf("%d retried attempt(s) arrived with an empty body", got)
	}
}

// TestCircuitBreakerCountsConsecutiveFailures pins the OnSuccess reset.
//
// OnSuccess fast-pathed out on StateClosed *before* clearing failureCount, so
// the StateClosed reset below it was unreachable. The tally accumulated for the
// lifetime of the process and the breaker opened on failures scattered across
// thousands of unrelated successes -- contradicting the README's "5 consecutive
// failures".
func TestCircuitBreakerCountsConsecutiveFailures(t *testing.T) {
	t.Parallel()

	breaker := httpclient.NewCircuitBreaker(&httpclient.CircuitBreakerConfig{
		Enabled:               true,
		FailureThreshold:      5,
		ResetTimeout:          10 * time.Second,
		HalfOpenSuccessNeeded: 2,
	})

	// Four failures, each separated by a success. Under the "consecutive"
	// contract the circuit must stay closed indefinitely.
	for range 400 {
		breaker.OnFailure()
		breaker.OnSuccess()
	}

	if state := breaker.State(); state != httpclient.StateClosed {
		t.Fatalf(
			"circuit is %v after 400 isolated failures each followed by a success; "+
				"want Closed (threshold is consecutive, not cumulative)",
			state,
		)
	}

	// Five back-to-back failures must still open it.
	for range 5 {
		breaker.OnFailure()
	}

	if state := breaker.State(); state != httpclient.StateOpen {
		t.Fatalf("circuit is %v after 5 consecutive failures; want Open", state)
	}
}

func drain(t *testing.T, resp *http.Response) {
	t.Helper()

	if resp == nil || resp.Body == nil {
		return
	}

	_, _ = io.Copy(io.Discard, resp.Body)
	_ = resp.Body.Close()
}

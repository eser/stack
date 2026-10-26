# 📡 [ajan/httpclient](./)

> **eserstack Go library** in the root module `github.com/eser/stack`. Import
> `github.com/eser/stack/pkg/ajan/httpclient`. The module is not published for
> `go get`: build inside this repository, or require `github.com/eser/stack`
> with a `replace` directive that points at a checkout.

**httpclient** is a resilient HTTP client that keeps the standard `net/http`
interfaces while adding a circuit breaker and retries with exponential backoff
and jitter, for services that call other services. `Client` embeds
`*http.Client`, so `Get`, `Post` and `Do` work as usual, and the resilience
lives in an `http.RoundTripper`.

## Key Features

- Embeds `net/http.Client`; pass `client.Client` where an `*http.Client` is
  expected
- Circuit breaker pattern implementation
- Exponential backoff retry mechanism with jitter
- Context-aware request handling
- Configurable failure thresholds and timeouts
- Support for HTTP request body retries (when `GetBody` is implemented)
- An HTTP/3 round tripper with certificate pinning

## Quick Start

A test server fails twice with 503 and then answers; the default client retries
until it succeeds:

```go
package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"sync/atomic"
	"time"

	"github.com/eser/stack/pkg/ajan/httpclient"
)

func main() {
	var attempts atomic.Int32

	server := httptest.NewServer(http.HandlerFunc(
		func(w http.ResponseWriter, _ *http.Request) {
			if attempts.Add(1) < 3 {
				w.WriteHeader(http.StatusServiceUnavailable)

				return
			}

			fmt.Fprint(w, "ok")
		},
	))
	defer server.Close()

	err := fetch(context.Background(), server.URL)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	fmt.Println("attempts:", attempts.Load())
}

func fetch(ctx context.Context, url string) error {
	client := httpclient.NewClient(httpclient.WithTimeout(10 * time.Second))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("get %s: %w", url, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read body: %w", err)
	}

	fmt.Println(resp.StatusCode, string(body))

	return nil
}
```

It prints `200 ok`, then `attempts: 3`, after waiting about 200 ms and 400 ms
between the attempts.

## How Requests Are Retried

Each request makes up to `MaxAttempts` attempts. An attempt fails when the
transport returns an error or the status code is at least `ServerErrorThreshold`
(500 by default). Before attempt `n` (counting the first as 0), the client waits
`InitialInterval × Multiplier^n`, varied by up to `RandomFactor` in either
direction and capped at `MaxInterval`. With the defaults that is about 200 ms,
then 400 ms.

When every attempt fails, the result depends on the last failure:

- A server error response: the response is discarded and `Do` returns
  `ErrMaxRetries`. With retries disabled, the response itself is returned with a
  nil error.
- A transport error: `Do` returns `ErrAllRetryAttemptsFailed` wrapping it, or
  `ErrTransportError` when retries are disabled.

A context that ends during a backoff wait stops the retries with
`ErrRequestContextError`. To count the retries of one request, attach a counter
with `httpclient.WithRetryCounter(ctx, &counter)`; it grows by one per retry.

## How the Circuit Breaker Works

The circuit breaker counts consecutive failed attempts, across all requests of
one client:

- **Closed**: requests pass. A success resets the count, and `FailureThreshold`
  consecutive failures open the circuit.
- **Open**: requests fail at once with `ErrCircuitOpen`, without contacting the
  server, until `ResetTimeout` has passed since the last failure.
- **Half-open**: requests pass again. `HalfOpenSuccessNeeded` successes close
  the circuit; one failure opens it again.

A request whose attempts open the circuit stops retrying and returns
`ErrCircuitOpen`. Read the state with `client.Transport.CircuitBreaker.State()`,
which returns `httpclient.StateClosed`, `StateHalfOpen` or `StateOpen`.

The circuit breaker and the retry strategy (`CircuitBreaker`, `RetryStrategy`,
their configs and defaults) live in the `httpclient/resilience` subpackage,
which does not import `net/http`; the names here are aliases of it. The WASM
build of the ajan bridge uses that package to retry and break circuits the same
way on the host's fetch.

## Usage

The circuit breaker and retry strategy can be configured in **four independent
modes**. A `Config` you build yourself starts from zero values, so set every
field you rely on, `ServerErrorThreshold` above all: at 0, every response counts
as a failure.

### 1. Both Enabled (Default)

`NewClient()` without `WithConfig` uses these values:

```go
client := httpclient.NewClient(
	httpclient.WithConfig(&httpclient.Config{
		CircuitBreaker: httpclient.CircuitBreakerConfig{
			Enabled:               true,
			FailureThreshold:      5,
			ResetTimeout:          10 * time.Second,
			HalfOpenSuccessNeeded: 2,
		},
		RetryStrategy: httpclient.RetryStrategyConfig{
			Enabled:         true,
			MaxAttempts:     3,
			InitialInterval: 100 * time.Millisecond,
			MaxInterval:     10 * time.Second,
			Multiplier:      2.0,
			RandomFactor:    0.1,
		},
		ServerErrorThreshold: 500,
	}),
)
```

**Behavior**: Requests are retried up to `MaxAttempts` times. If failures reach
`FailureThreshold`, the circuit breaker opens and subsequent requests fail
immediately with `ErrCircuitOpen`.

### 2. Circuit Breaker Only (Retry Disabled)

```go
client := httpclient.NewClient(
	httpclient.WithConfig(&httpclient.Config{
		CircuitBreaker: httpclient.CircuitBreakerConfig{
			Enabled:               true,
			FailureThreshold:      3,
			ResetTimeout:          1 * time.Second,
			HalfOpenSuccessNeeded: 1,
		},
		RetryStrategy: httpclient.RetryStrategyConfig{
			Enabled: false, // Retry disabled
		},
		ServerErrorThreshold: 500,
	}),
)
```

**Behavior**: No retries are performed. After `FailureThreshold` failures, the
circuit breaker opens. Server error responses (5xx) are returned directly until
the circuit opens.

### 3. Retry Only (Circuit Breaker Disabled)

```go
client := httpclient.NewClient(
	httpclient.WithConfig(&httpclient.Config{
		CircuitBreaker: httpclient.CircuitBreakerConfig{
			Enabled: false, // Circuit breaker disabled
		},
		RetryStrategy: httpclient.RetryStrategyConfig{
			Enabled:         true,
			MaxAttempts:     3,
			InitialInterval: time.Millisecond,
			MaxInterval:     time.Second,
			Multiplier:      1.0,
			RandomFactor:    0,
		},
		ServerErrorThreshold: 500,
	}),
)
```

**Behavior**: Requests are retried up to `MaxAttempts` times with exponential
backoff. No circuit breaking occurs: retries continue regardless of failure
patterns.

### 4. Neither Enabled (Basic HTTP Client)

```go
client := httpclient.NewClient(
	httpclient.WithConfig(&httpclient.Config{
		CircuitBreaker: httpclient.CircuitBreakerConfig{
			Enabled: false, // Circuit breaker disabled
		},
		RetryStrategy: httpclient.RetryStrategyConfig{
			Enabled: false, // Retry disabled
		},
		ServerErrorThreshold: 500,
	}),
)
```

**Behavior**: Behaves like a standard HTTP client. Requests are made once with
no retries or circuit breaking. Server errors are returned directly. The request
body rule below still applies.

## Request Bodies

Every request with a body needs `GetBody`, so the client can send the body again
on a retry; without it, `Do` returns `ErrRequestBodyNotRetriable` even when
retries are disabled. `http.NewRequest` and `client.Post` set `GetBody` for a
`*bytes.Buffer`, `*bytes.Reader` or `*strings.Reader` body:

```go
resp, err := client.Post(
	"https://api.example.com/items",
	"application/json",
	bytes.NewReader(payload),
)
```

For any other reader, set `req.GetBody` yourself or read the body into a
`[]byte` first.

## Error Types

The client returns specific errors based on the failure mode. `http.Client`
wraps them in a `*url.Error`, so match them with `errors.Is`:

- `ErrCircuitOpen`: Circuit breaker is open (circuit breaker feature)
- `ErrMaxRetries`: Retry attempts exhausted on server error responses (retry
  feature)
- `ErrAllRetryAttemptsFailed`: All retry attempts failed with transport errors
- `ErrTransportError`: Underlying transport failure
- `ErrRequestBodyNotRetriable`: Request body cannot be retried
- `ErrRequestContextError`: The request context ended during a backoff wait

## Usage Examples

### High-Availability Service (Both Enabled)

For critical services that need both retry resilience and circuit breaking, tell
the two failure modes apart:

```go
resp, err := client.Get("https://critical-service.example.com/api")
if errors.Is(err, httpclient.ErrCircuitOpen) {
	// Circuit breaker is open: the service is likely down
	logger.WarnContext(ctx, "circuit breaker open for critical service")

	return fmt.Errorf("call critical service: %w", err)
}

if errors.Is(err, httpclient.ErrMaxRetries) {
	// Retries exhausted, but the circuit still allows requests
	logger.ErrorContext(ctx, "all retries failed for critical service")

	return fmt.Errorf("call critical service: %w", err)
}

if err != nil {
	return fmt.Errorf("call critical service: %w", err)
}
defer resp.Body.Close()
```

### Context Support

```go
client := httpclient.NewClient()

ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
defer cancel()

req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.example.com", nil)
if err != nil {
	return fmt.Errorf("build request: %w", err)
}

resp, err := client.Do(req)
if err != nil {
	return fmt.Errorf("get api.example.com: %w", err)
}
defer resp.Body.Close()
```

The deadline covers every attempt and every backoff wait of the request.

## Options

- `WithConfig(config *Config)`: the resilience settings, used as given.
- `WithTimeout(timeout time.Duration)`: `http.Client.Timeout` for each call,
  retries included. The default is no timeout, so set this or a context
  deadline.
- `WithTLSClientConfig(tlsConfig *tls.Config)`: TLS settings for the default
  transport, a clone of `http.DefaultTransport`.
- `WithRoundTripper(rt http.RoundTripper)`: the transport the resilient layer
  wraps, instead of the default one. `WithTLSClientConfig` does not apply to it.

### HTTP/3

`NewHTTP3RoundTripper` returns a quic-go HTTP/3 transport to pass to
`WithRoundTripper`, so retries and the circuit breaker apply over HTTP/3:

```go
client := httpclient.NewClient(
	httpclient.WithRoundTripper(
		httpclient.NewHTTP3RoundTripper(
			httpclient.WithH3CertHashes(fingerprints),
			httpclient.WithH3DialTimeout(5*time.Second),
		),
	),
)
```

`WithH3CertHashes` accepts the server only when the SHA-256 hash of its leaf
certificate matches one of the hashes, for self-signed development servers;
without it the transport verifies the chain and host name as usual.
`WithH3TLSClientConfig` sets the base TLS settings, and TLS 1.3 is always the
minimum.

## Configuration Details

`Config` carries `conf` tags, so [configfx](../configfx/README.md) can load it,
defaults included:

```go
type Config struct {
	CircuitBreaker CircuitBreakerConfig `conf:"circuit_breaker"`
	RetryStrategy  RetryStrategyConfig  `conf:"retry_strategy"`
	Transport      TransportConfig      `conf:"transport"`

	ServerErrorThreshold int `conf:"server_error_threshold" default:"500"`
}
```

Under a `conf:"http_client"` field,
`http_client__retry_strategy__max_attempts=5` sets `MaxAttempts` from the
environment.

### Circuit Breaker Configuration

```go
type CircuitBreakerConfig struct {
	Enabled               bool          // Enable/disable circuit breaker (default true)
	FailureThreshold      uint          // Consecutive failures that open the circuit (default 5)
	ResetTimeout          time.Duration // Time before trying half-open (default 10s)
	HalfOpenSuccessNeeded uint          // Successes needed to close circuit (default 2)
}
```

### Retry Strategy Configuration

```go
type RetryStrategyConfig struct {
	Enabled         bool          // Enable/disable retry mechanism (default true)
	MaxAttempts     uint          // Maximum number of attempts, including the first (default 3)
	InitialInterval time.Duration // Base retry delay (default 100ms)
	MaxInterval     time.Duration // Maximum retry delay (default 10s)
	Multiplier      float64       // Backoff multiplier (default 2)
	RandomFactor    float64       // Jitter factor, 0.0 to 1.0 (default 0.1)
}
```

### Transport Configuration

`TransportConfig` holds connection pool settings (`max_idle_conns`,
`max_idle_conns_per_host`, `max_conns_per_host`, `idle_conn_timeout`), but
`NewClient` does not apply them yet. To size the pool, build an
`*http.Transport` and pass it with `WithRoundTripper`.

## Testing

The package includes tests covering all four independent operation modes:

- `TestClientCircuitBreakerOnly`: Circuit breaker enabled, retry disabled
- `TestClientRetryOnly`: Retry enabled, circuit breaker disabled
- `TestClientCircuitBreakerAndRetryBoth`: Both features enabled with retry
  exhaustion
- `TestClientCircuitBreakerOpensBeforeRetryExhaustion`: Circuit breaker opens
  before retries exhaust
- `TestClientNoResilienceFeatures`: Both features disabled

Run tests from the repository root with:

```bash
go test -race ./pkg/ajan/httpclient/...
```

## Best Practices

1. **Use Both for Critical Services**: Enable both circuit breaker and retry for
   critical external services
2. **Circuit Breaker for Unstable Services**: Use circuit breaker only for
   services known to have stability issues
3. **Retry for Transient Errors**: Use retry only for services with temporary
   network issues
4. **Monitor State**: Read the circuit breaker state and count retries with
   `WithRetryCounter` for observability
5. **Configure Timeouts**: Always set a request timeout (`WithTimeout` or a
   context deadline) alongside these features
6. **Close Response Bodies**: Close every response body you receive
7. **Use Rewindable Bodies**: Build POST and PUT requests from a
   `*bytes.Reader`, `*bytes.Buffer` or `*strings.Reader`, or implement `GetBody`
8. **Tune for the Downstream Service**: Choose thresholds and retry settings
   that do not overwhelm the service you call

## Thread Safety

The client is safe for concurrent use by multiple goroutines. The circuit
breaker is shared by every request of the client and updates its state with
atomics and a mutex.

## 🔗 Links

- `go doc github.com/eser/stack/pkg/ajan/httpclient`: the API reference
  generated from source
- [ajan/connfx](../connfx/README.md): HTTP connections built on this client
- [ajan/configfx](../configfx/README.md): loads `Config` from files and the
  environment
- [eser/stack on GitHub](https://github.com/eser/stack)

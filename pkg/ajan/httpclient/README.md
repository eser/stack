# eser-go/httpclient

## Overview

**httpclient** is a resilient HTTP client that is 100% compatible with the
standard `net/http` interfaces while providing additional features for improved
reliability and fault tolerance.

## Key Features

- Drop-in replacement for `net/http.Client`
- Circuit breaker pattern implementation
- Exponential backoff retry mechanism with jitter
- Context-aware request handling
- Configurable failure thresholds and timeouts
- Support for HTTP request body retries (when `GetBody` is implemented)

## Usage

The circuit breaker and retry strategy can be configured in **four independent
modes**:

### 1. Both Enabled (Default)

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
backoff. No circuit breaking occurs - retries continue regardless of failure
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
no retries or circuit breaking. Server errors are returned directly.

## Error Types

The client returns specific errors based on the failure mode:

- `ErrCircuitOpen`: Circuit breaker is open (circuit breaker feature)
- `ErrMaxRetries`: Retry attempts exhausted (retry feature)
- `ErrAllRetryAttemptsFailed`: All retry attempts failed with transport errors
- `ErrTransportError`: Underlying transport failure
- `ErrRequestBodyNotRetriable`: Request body cannot be retried

## Usage Examples

### Example 1: High-Availability Service (Both Enabled)

```go
// For critical services that need both retry resilience and circuit breaking
client := httpclient.NewClient(
    httpclient.WithConfig(&httpclient.Config{
        CircuitBreaker: httpclient.CircuitBreakerConfig{
            Enabled:               true,
            FailureThreshold:      5,  // Open after 5 consecutive failures
            ResetTimeout:          30 * time.Second,
            HalfOpenSuccessNeeded: 3,  // Need 3 successes to close
        },
        RetryStrategy: httpclient.RetryStrategyConfig{
            Enabled:         true,
            MaxAttempts:     3,        // Retry up to 3 times
            InitialInterval: 200 * time.Millisecond,
            MaxInterval:     5 * time.Second,
            Multiplier:      2.0,
            RandomFactor:    0.1,
        },
        ServerErrorThreshold: 500,
    }),
)

resp, err := client.Get("https://critical-service.com/api")
if errors.Is(err, httpclient.ErrCircuitOpen) {
    // Circuit breaker is open - service is likely down
    log.Warn("Circuit breaker open for critical service")
} else if errors.Is(err, httpclient.ErrMaxRetries) {
    // Retries exhausted but circuit breaker still allows requests
    log.Error("All retries failed for critical service")
}
```

### Example 2: Fast-Failing Service (Circuit Breaker Only)

```go
// For services where you want immediate failure detection
client := httpclient.NewClient(
    httpclient.WithConfig(&httpclient.Config{
        CircuitBreaker: httpclient.CircuitBreakerConfig{
            Enabled:               true,
            FailureThreshold:      2,  // Fail fast after 2 failures
            ResetTimeout:          5 * time.Second,
            HalfOpenSuccessNeeded: 1,
        },
        RetryStrategy: httpclient.RetryStrategyConfig{
            Enabled: false, // No retries - fail fast
        },
    }),
)
```

### Example 3: Transient Error Recovery (Retry Only)

```go
// For services with transient errors but no need for circuit breaking
client := httpclient.NewClient(
    httpclient.WithConfig(&httpclient.Config{
        CircuitBreaker: httpclient.CircuitBreakerConfig{
            Enabled: false, // No circuit breaking
        },
        RetryStrategy: httpclient.RetryStrategyConfig{
            Enabled:         true,
            MaxAttempts:     5,        // Aggressive retry
            InitialInterval: 50 * time.Millisecond,
            MaxInterval:     2 * time.Second,
            Multiplier:      1.5,
            RandomFactor:    0.2,      // Add jitter
        },
    }),
)
```

### Example 4: Simple HTTP Client (Neither Enabled)

```go
// For simple use cases or when you want to handle failures manually
client := httpclient.NewClient(
    httpclient.WithConfig(&httpclient.Config{
        CircuitBreaker: httpclient.CircuitBreakerConfig{Enabled: false},
        RetryStrategy:  httpclient.RetryStrategyConfig{Enabled: false},
    }),
)

// Handle errors manually
resp, err := client.Get("https://api.example.com")
if err != nil {
    // Handle transport errors
}
if resp.StatusCode >= 500 {
    // Handle server errors
}
```

### Example 5: Context Support

```go
client := httpclient.NewClient()

ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.example.com", nil)
if err != nil {
  // Handle error
}

resp, err := client.Do(req)
if err != nil {
  // Handle error
}
defer resp.Body.Close()
```

## Configuration Details

### Circuit Breaker Configuration

```go
type CircuitBreakerConfig struct {
    Enabled               bool          // Enable/disable circuit breaker
    FailureThreshold      uint          // Number of failures to open circuit
    ResetTimeout          time.Duration // Time before trying half-open
    HalfOpenSuccessNeeded uint          // Successes needed to close circuit
}
```

### Retry Strategy Configuration

```go
type RetryStrategyConfig struct {
    Enabled         bool          // Enable/disable retry mechanism
    MaxAttempts     uint          // Maximum number of attempts (including initial)
    InitialInterval time.Duration // Initial retry delay
    MaxInterval     time.Duration // Maximum retry delay
    Multiplier      float64       // Backoff multiplier
    RandomFactor    float64       // Jitter factor (0.0 to 1.0)
}
```

## Testing

The package includes comprehensive tests covering all four independent operation
modes:

- `TestClientCircuitBreakerOnly`: Circuit breaker enabled, retry disabled
- `TestClientRetryOnly`: Retry enabled, circuit breaker disabled
- `TestClientCircuitBreakerAndRetryBoth`: Both features enabled with retry
  exhaustion
- `TestClientCircuitBreakerOpensBeforeRetryExhaustion`: Circuit breaker opens
  before retries exhaust
- `TestClientNoResilienceFeatures`: Both features disabled

Run tests with:

```bash
go test -v ./httpclient
```

## Best Practices

1. **Use Both for Critical Services**: Enable both circuit breaker and retry for
   mission-critical external services
2. **Circuit Breaker for Unstable Services**: Use circuit breaker only for
   services known to have stability issues
3. **Retry for Transient Errors**: Use retry only for services with temporary
   network issues
4. **Monitor Metrics**: Track circuit breaker state and retry counts for
   observability
5. **Configure Timeouts**: Always set appropriate request timeouts alongside
   these features

## Best Practices

1. Always use context for request timeouts
2. Close response bodies
3. Implement `GetBody` for POST/PUT requests that need retry support
4. Configure circuit breaker thresholds based on your service's characteristics
5. Use appropriate retry settings to avoid overwhelming downstream services

## Thread Safety

The client is safe for concurrent use by multiple goroutines.

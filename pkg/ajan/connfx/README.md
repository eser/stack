# eser-go/connfx

## Overview

**connfx** provides a unified connection management system for all external
integrations in the eser-go framework. It features **centralized OTLP connection
management** that enables `logfx`, `metricsfx`, and `tracesfx` to share
connections efficiently while maintaining separation of concerns.

### Key Features

- 🔗 **Unified Connection Management** - Single registry for all external
  connections
- 🌐 **OTLP Adapter** - Centralized OpenTelemetry Protocol connections shared
  across observability packages
- 🔄 **Connection Pooling** - Efficient resource sharing and lifecycle
  management
- 🛡️ **Health Monitoring** - Built-in connection health checks and graceful
  fallbacks
- 🎛️ **Protocol Support** - Support for HTTP, Redis, SQL, OTLP, and custom
  protocols
- ⚙️ **Configuration Management** - Environment-based configuration with
  validation
- 🔧 **Bridge Pattern** - Avoid import cycles while enabling package integration

## Quick Start

### Basic OTLP Connection Setup

```go
package main

import (
    "context"
    "time"

    "github.com/eser/stack/pkg/eser-go/connfx"
    "github.com/eser/stack/pkg/eser-go/logfx"
)

func main() {
    ctx := context.Background()

    // Create connection registry
    logger := logfx.NewLogger()
    registry := connfx.NewRegistryWithDefaults(logger)

    // Configure OTLP connection for observability stack
    _, err := registry.AddConnection(ctx, "otel", &connfx.ConfigTarget{
        Protocol: "otlp",
        DSN:      "otel-collector:4318",
        Properties: map[string]any{
            "service_name":    "my-service",
            "service_version": "1.0.0",
            "insecure":        true,
        },
    })
    if err != nil {
        panic(err)
    }

    // Check connection health
    status := registry.HealthCheck(ctx)
    if status["otel"] == "healthy" {
        logger.Info("OTLP connection established successfully")
    }

    // Connection is now available for all observability packages
    defer registry.Close(ctx)
}
```

### Complete Observability Stack Integration

```go
package main

import (
    "context"
    "net/http"
    "time"

    "github.com/eser/stack/pkg/eser-go/connfx"
    "github.com/eser/stack/pkg/eser-go/httpfx"
    "github.com/eser/stack/pkg/eser-go/httpfx/middlewares"
    "github.com/eser/stack/pkg/eser-go/logfx"
    "github.com/eser/stack/pkg/eser-go/metricsfx"
    "github.com/eser/stack/pkg/eser-go/tracesfx"
)

func main() {
    ctx := context.Background()

    // Step 1: Create connection registry with multiple connections
    logger := logfx.NewLogger()
    registry := connfx.NewRegistryWithDefaults(logger)

    // OTLP connection for observability
    _, err := registry.AddConnection(ctx, "otel", &connfx.ConfigTarget{
        Protocol: "otlp",
        DSN:      "otel-collector:4318",
        Properties: map[string]any{
            "service_name":     "my-api",
            "service_version":  "1.0.0",
            "insecure":         true,
        },
    })
    if err != nil {
        panic(err)
    }

    // Redis connection for caching
    _, err = registry.AddConnection(ctx, "cache", &connfx.ConfigTarget{
        Protocol: "redis",
        URL:      "redis://localhost:6379/0",
    })
    if err != nil {
        panic(err)
    }

    // Database connection
    _, err = registry.AddConnection(ctx, "db", &connfx.ConfigTarget{
        Protocol: "sql",
        URL:      "postgres://user:pass@localhost/mydb",
        Properties: map[string]any{
            "max_open_connections": 25,
            "max_idle_connections": 10,
        },
    })
    if err != nil {
        panic(err)
    }

    // Step 2: Create observability stack using shared OTLP connection

    // All packages reference the same "otel" connection
    logger = logfx.NewLogger(
        logfx.WithConfig(&logfx.Config{
            Level:              "INFO",
        }),
    )

    // Step 3: Use connections in application
    router := httpfx.NewRouter("/api")

    // Add observability middleware
    router.Use(middlewares.TracingMiddleware(logger, ""))

    router.Route("GET /health", func(ctx *httpfx.Context) httpfx.Result {
        // Check all connection health
        health := registry.HealthCheck(ctx.Request.Context())

        // Use connections in handler
        // Redis connection automatically available
        // Database connection automatically available
        // OTLP automatically exports logs, metrics, traces

        return ctx.Results.JSON(map[string]any{
            "status":      "healthy",
            "connections": health,
        })
    })

    // Cleanup all connections on shutdown
    defer registry.Close(ctx)

    http.ListenAndServe(":8080", router.GetMux())
}
```

## OTLP Adapter - Unified Observability

### Why Centralized OTLP Connections?

The OTLP adapter in `connfx` provides a unified approach to OpenTelemetry
connections:

**Problem (Before):**

```go
// Each package configured separately - duplicated configuration
logger := logfx.NewLogger(logfx.WithOTLP("otel-collector:4318", true))
metrics := metricsfx.NewMetricsProvider(&metricsfx.Config{
    OTLPEndpoint: "otel-collector:4318",
    ServiceName:  "my-service",
})
traces := tracesfx.NewTracesProvider(&tracesfx.Config{
    OTLPEndpoint: "otel-collector:4318",
    ServiceName:  "my-service",
})
```

**Solution (After):**

```go
// Single OTLP connection shared across all packages
registry.AddConnection(ctx, "otel", &connfx.ConfigTarget{
    Protocol: "otlp",
    DSN:      "otel-collector:4318",
    Properties: map[string]any{
        "service_name":    "my-service",
        "service_version": "1.0.0",
    },
})

// All packages reference the same connection
logger := logfx.NewLogger(logfx.WithOTLP("otel"), logfx.WithRegistry(registry))
metrics := metricsfx.NewMetricsProvider(&metricsfx.Config{OTLPConnectionName: "otel"}, registry)
traces := tracesfx.NewTracesProvider(&tracesfx.Config{OTLPConnectionName: "otel"}, registry)
```

### OTLP Configuration Options

```go
// Complete OTLP connection configuration
otlpConfig := &connfx.ConfigTarget{
    Protocol: "otlp",
    DSN:      "otel-collector:4318",

    // Connection settings
    TLS:      false,                         // Enable TLS

    Properties: map[string]any{
        // Service identification (applied to all signals)
        "service_name":     "my-service",
        "service_version":  "1.0.0",
        "environment":      "production",

        // Connection settings
        "insecure":         true,             // Use HTTP instead of HTTPS
        "timeout":          30 * time.Second, // Connection timeout

        // Export configuration
        "export_interval":  30 * time.Second, // Metrics export interval
        "batch_timeout":    5 * time.Second,  // Traces batch timeout
        "batch_size":       512,              // Traces batch size
        "sample_ratio":     1.0,              // Traces sampling ratio

        // Resource attributes (applied to all signals)
        "deployment.environment": "production",
        "service.namespace":      "ecommerce",
        "service.instance.id":    "pod-123",
    },
}

_, err := registry.AddConnection(ctx, "otel", otlpConfig)
```

### Environment-Based OTLP Configuration

```bash
# OTLP connection configuration
CONN_TARGETS_OTEL_PROTOCOL=otlp
CONN_TARGETS_OTEL_DSN=otel-collector:4318
CONN_TARGETS_OTEL_TLS=false

# Service identification
CONN_TARGETS_OTEL_PROPERTIES_SERVICE_NAME=my-service
CONN_TARGETS_OTEL_PROPERTIES_SERVICE_VERSION=1.0.0
CONN_TARGETS_OTEL_PROPERTIES_ENVIRONMENT=production

# Connection settings
CONN_TARGETS_OTEL_PROPERTIES_INSECURE=true
CONN_TARGETS_OTEL_PROPERTIES_TIMEOUT=30s

# Export configuration
CONN_TARGETS_OTEL_PROPERTIES_EXPORT_INTERVAL=30s
CONN_TARGETS_OTEL_PROPERTIES_BATCH_TIMEOUT=5s
CONN_TARGETS_OTEL_PROPERTIES_BATCH_SIZE=512
CONN_TARGETS_OTEL_PROPERTIES_SAMPLE_RATIO=1.0

# Package configuration (references the connection)
LOG_OTLP_CONNECTION_NAME=otel
METRICS_OTLP_CONNECTION_NAME=otel
TRACES_OTLP_CONNECTION_NAME=otel
```

### Multiple OTLP Environments

```go
// Different OTLP endpoints for different purposes
connections := map[string]*connfx.ConfigTarget{
    // Production telemetry
    "otel-prod": {
        Protocol: "otlp",
        URL:      "https://prod-collector:4317",
        TLS:      true,
        Properties: map[string]any{
            "service_name":    "my-service",
            "environment":     "production",
            "sample_ratio":    0.1,  // 10% sampling for production
        },
    },

    // Development telemetry
    "otel-dev": {
        Protocol: "otlp",
        URL:      "http://dev-collector:4318",
        Properties: map[string]any{
            "service_name":    "my-service-dev",
            "environment":     "development",
            "sample_ratio":    1.0,  // 100% sampling for development
        },
    },

    // Business metrics (separate endpoint)
    "otel-business": {
        Protocol: "otlp",
        URL:      "http://business-metrics:4318",
        Properties: map[string]any{
            "service_name":     "my-service",
            "export_interval":  60 * time.Second,  // Less frequent for business metrics
        },
    },
}

// Add all connections
for name, config := range connections {
    _, err := registry.AddConnection(ctx, name, config)
    if err != nil {
        logger.Error("Failed to add connection", "name", name, "error", err)
    }
}

// Use different connections for different purposes
prodLogger := logfx.NewLogger(logfx.WithOTLP("otel-prod"), logfx.WithRegistry(registry))
devMetrics := metricsfx.NewMetricsProvider(&metricsfx.Config{OTLPConnectionName: "otel-dev"}, registry)
businessMetrics := metricsfx.NewMetricsProvider(&metricsfx.Config{OTLPConnectionName: "otel-business"}, registry)
```

## Protocol Support

### HTTP Connections

```go
_, err := registry.AddConnection(ctx, "api", &connfx.ConfigTarget{
    Protocol: "http",
    URL:      "https://api.external.com",
    Properties: map[string]any{
        "timeout":         30 * time.Second,
        "max_connections": 100,
        "headers": map[string]string{
            "Authorization": "Bearer token",
            "User-Agent":    "my-service/1.0.0",
        },
    },
})
```

### Redis Connections

```go
_, err := registry.AddConnection(ctx, "cache", &connfx.ConfigTarget{
    Protocol: "redis",
    URL:      "redis://localhost:6379/0",
    Properties: map[string]any{
        "max_idle":        10,
        "max_active":      100,
        "idle_timeout":    240 * time.Second,
        "password":        "secret",
    },
})
```

### SQL Database Connections

```go
_, err := registry.AddConnection(ctx, "db", &connfx.ConfigTarget{
    Protocol: "sql",
    URL:      "postgres://user:pass@localhost/mydb?sslmode=disable",
    Properties: map[string]any{
        "max_open_connections": 25,
        "max_idle_connections": 10,
        "connection_max_lifetime": 5 * time.Minute,
    },
})
```

## Connection Management

### Health Monitoring

```go
// Check individual connection
client, err := registry.GetConnection(ctx, "otel")
if err != nil {
    logger.Error("OTLP connection unavailable", "error", err)
}

// Check all connections
healthStatus := registry.HealthCheck(ctx)
for name, status := range healthStatus {
    logger.Info("Connection status", "name", name, "status", status)
}

// Health check returns:
// - "healthy": Connection is working properly
// - "unhealthy": Connection has issues
// - "unknown": Connection status cannot be determined
```

### Connection Lifecycle

```go
// Get connection for use
conn, err := registry.GetConnection(ctx, "cache")
if err != nil {
    return fmt.Errorf("cache unavailable: %w", err)
}

// Use type assertion to get specific client
if redisConn, ok := conn.(*redis.Client); ok {
    return redisConn.Set(ctx, key, value, 0).Err()
}

// Connections are automatically cleaned up
defer registry.Close(ctx)  // Closes all connections gracefully
```

### Registry Configuration

```go
// Create registry with custom configuration
config := &connfx.RegistryConfig{
    HealthCheckInterval: 30 * time.Second,
    HealthCheckTimeout:  5 * time.Second,
    MaxConnections:      100,
    EnableLogging:       true,
}

registry := connfx.NewRegistry(config, logger)

// Add connections with validation
_, err := registry.AddConnection(ctx, "otel", otlpConfig)
if err != nil {
    logger.Error("Failed to configure OTLP", "error", err)
    // Registry handles failures gracefully
}
```

## Bridge Pattern Implementation

### How Packages Access Connections

The bridge pattern prevents import cycles while enabling packages to access
connections:

```go
// In metricsfx/bridge.go
type ConnectionRegistry interface {
    GetConnection(ctx context.Context, name string) (any, error)
}

func getOTLPExporter(registry ConnectionRegistry, connectionName string) (any, error) {
    if registry == nil {
        return nil, ErrNoRegistryProvided
    }

    // Use reflection to avoid direct dependency on connfx
    return getConnectionViaReflection(registry, connectionName, "otlp")
}

// In metricsfx/provider.go
func NewMetricsProvider(config *Config, registry ConnectionRegistry) *MetricsProvider {
    return &MetricsProvider{
        config:   config,
        registry: registry,  // Store registry interface
    }
}

func (p *MetricsProvider) Init() error {
    if p.config.OTLPConnectionName != "" {
        exporter, err := getOTLPExporter(p.registry, p.config.OTLPConnectionName)
        if err != nil {
            return fmt.Errorf("%w (name=%q): %w", ErrFailedToGetOTLPExporter, p.config.OTLPConnectionName, err)
        }
        // Use exporter...
    }
    return nil
}
```

### Benefits of Bridge Pattern

1. **No Import Cycles** - Observability packages don't directly import `connfx`
2. **Interface Segregation** - Each package only sees the connection methods it
   needs
3. **Loose Coupling** - Packages work with or without connection registry
4. **Testability** - Easy to mock connection registry for tests
5. **Graceful Degradation** - Packages continue working when connections are
   unavailable

## Advanced Usage

### Custom Connection Adapters

```go
// Implement custom adapter for new protocols
type MyProtocolAdapter struct {
    config *connfx.ConfigTarget
    client *MyProtocolClient
}

func (a *MyProtocolAdapter) Connect(ctx context.Context) error {
    client, err := NewMyProtocolClient(a.config.URL)
    if err != nil {
        return err
    }
    a.client = client
    return nil
}

func (a *MyProtocolAdapter) Close(ctx context.Context) error {
    return a.client.Close()
}

func (a *MyProtocolAdapter) HealthCheck(ctx context.Context) (string, error) {
    if err := a.client.Ping(ctx); err != nil {
        return "unhealthy", err
    }
    return "healthy", nil
}

func (a *MyProtocolAdapter) GetClient() any {
    return a.client
}

// Register custom adapter
registry.RegisterAdapter("myprotocol", func(config *connfx.ConfigTarget) connfx.Adapter {
    return &MyProtocolAdapter{config: config}
})
```

### Configuration Validation

```go
// Add connection with validation
err := registry.AddConnection(ctx, "otel", &connfx.ConfigTarget{
    Protocol: "otlp",
    URL:      "invalid-url",  // This will be validated
})

if err != nil {
    // Handle configuration errors
    logger.Error("Invalid OTLP configuration", "error", err)
}
```

### Observability Integration Benefits

The centralized OTLP connection approach provides significant benefits for
observability:

1. **Unified Configuration** - Configure service name, version, and endpoints
   once
2. **Consistent Attribution** - All telemetry signals have consistent resource
   attributes
3. **Shared Connection Pooling** - Efficient resource usage across all packages
4. **Centralized Health Monitoring** - Monitor OTLP connection health from one
   place
5. **Environment Flexibility** - Easy switching between dev/staging/prod
   collectors
6. **Cost Optimization** - Single connection reduces overhead and resource usage
7. **Graceful Degradation** - Applications continue working when OTLP is
   unavailable
8. **Configuration Validation** - Catch configuration errors early
9. **Lifecycle Management** - Proper connection setup and cleanup
10. **Bridge Pattern Benefits** - Clean package separation without import cycles

## Best Practices

1. **Centralize OTLP Configuration** - Use a single OTLP connection for all
   observability signals
2. **Environment-Based Config** - Use environment variables for different
   deployment environments
3. **Health Monitoring** - Regularly check connection health and handle failures
   gracefully
4. **Connection Lifecycle** - Always call `registry.Close(ctx)` during
   application shutdown
5. **Error Handling** - Handle connection failures gracefully with fallback
   behavior
6. **Resource Management** - Configure appropriate connection pools and timeouts
7. **Security** - Use TLS for production OTLP connections
8. **Monitoring** - Monitor connection health and performance metrics
9. **Testing** - Mock connection registry for unit tests
10. **Documentation** - Document connection dependencies for each service

## Resilient HTTP Connections

### Overview

The HTTP adapter in `connfx` now integrates with the `httpclient` package to
provide robust, production-ready HTTP connections with built-in resilience
features:

- **Circuit Breaker** - Prevents cascading failures by opening the circuit when
  errors exceed threshold
- **Retry Strategy** - Automatically retries failed requests with exponential
  backoff and jitter
- **Connection Pooling** - Efficient HTTP connection management and reuse
- **Health Monitoring** - Continuous health checks with detailed status
  reporting
- **TLS Support** - Secure connections with certificate management

### Basic HTTP Configuration

```go
// Basic HTTP connection with default resilience settings
_, err := registry.AddConnection(ctx, "api", &connfx.ConfigTarget{
    Protocol: "http",
    URL:      "https://api.example.com",
    Properties: map[string]any{
        "headers": map[string]string{
            "User-Agent":    "my-service/1.0",
            "Authorization": "Bearer token",
        },
    },
})

// Use the connection
conn, err := registry.GetConnection(ctx, "api")
httpConn := conn.(*connfx.HTTPConnection)

// Get the resilient client
client := httpConn.GetClient() // Returns *httpclient.Client
// Or get standard client
stdClient := httpConn.GetStandardClient() // Returns *http.Client
```

### Circuit Breaker Configuration

Control when connections are temporarily disabled to prevent cascading failures:

```go
_, err := registry.AddConnection(ctx, "api-resilient", &connfx.ConfigTarget{
    Protocol: "http",
    URL:      "https://api.example.com",
    Properties: map[string]any{
        "circuit_breaker": map[string]any{
            "enabled":                   true,  // Enable circuit breaker
            "failure_threshold":         5,     // Trip after 5 consecutive failures
            "reset_timeout":             30 * time.Second, // Try to reset after 30s
            "half_open_success_needed":  2,     // Need 2 successes to fully close
        },
        "server_error_threshold": 500, // HTTP status codes >= 500 count as failures
    },
})

// Monitor circuit breaker state
httpConn := conn.(*connfx.HTTPConnection)
state := httpConn.GetCircuitBreakerState() // "Closed", "Open", or "HalfOpen"
```

**Circuit Breaker States:**

- **Closed** - Normal operation, requests pass through
- **Open** - Circuit is tripped, requests fail fast without hitting the server
- **HalfOpen** - Testing if service has recovered, limited requests allowed

### Retry Strategy Configuration

Automatically retry failed requests with intelligent backoff:

```go
_, err := registry.AddConnection(ctx, "api-retry", &connfx.ConfigTarget{
    Protocol: "http",
    URL:      "https://api.example.com",
    Properties: map[string]any{
        "retry_strategy": map[string]any{
            "enabled":          true,   // Enable automatic retries
            "max_attempts":     3,      // Maximum total attempts (original + retries)
            "initial_interval": 100 * time.Millisecond, // Start with 100ms delay
            "max_interval":     10 * time.Second,       // Cap at 10s delay
            "multiplier":       2.0,    // Double the delay each retry
            "random_factor":    0.1,    // Add 10% jitter to prevent thundering herd
        },
    },
})
```

**Exponential Backoff Example:**

- Attempt 1: No delay
- Attempt 2: ~100ms delay (100ms + jitter)
- Attempt 3: ~200ms delay (200ms + jitter)
- etc.

### Advanced HTTP Configuration

Complete configuration with all resilience features:

```go
_, err := registry.AddConnection(ctx, "api-advanced", &connfx.ConfigTarget{
    Protocol: "http",
    URL:      "https://api.example.com",
    Timeout:  30 * time.Second,
    TLS:      true,

    // TLS certificate authentication (optional)
    CertFile: "/path/to/client.crt",
    KeyFile:  "/path/to/client.key",

    Properties: map[string]any{
        // Default headers for all requests
        "headers": map[string]string{
            "User-Agent":    "my-service/1.0",
            "Accept":        "application/json",
            "Content-Type":  "application/json",
            "Authorization": "Bearer token",
        },

        // Circuit breaker configuration
        "circuit_breaker": map[string]any{
            "enabled":                   true,
            "failure_threshold":         5,     // Trip after 5 failures
            "reset_timeout":             60 * time.Second, // Reset attempt after 1 minute
            "half_open_success_needed":  3,     // Need 3 successes to close circuit
        },

        // Retry strategy configuration
        "retry_strategy": map[string]any{
            "enabled":          true,
            "max_attempts":     4,      // Original + 3 retries
            "initial_interval": 250 * time.Millisecond,
            "max_interval":     30 * time.Second,
            "multiplier":       2.5,    // Aggressive backoff
            "random_factor":    0.2,    // 20% jitter
        },

        // HTTP error classification
        "server_error_threshold": 500, // Status >= 500 triggers circuit breaker
    },
})
```

### Making HTTP Requests

Use the resilient HTTP client for all requests:

```go
conn, err := registry.GetConnection(ctx, "api")
httpConn := conn.(*connfx.HTTPConnection)

// Method 1: Use the convenience method
req, err := httpConn.NewRequest(ctx, "GET", "/users/123", nil)
if err != nil {
    return err
}

client := httpConn.GetClient()
resp, err := client.Do(req)
if err != nil {
    // Error already went through circuit breaker and retry logic
    return fmt.Errorf("request failed after retries: %w", err)
}
defer resp.Body.Close()

// Method 2: Use standard HTTP client interface
stdClient := httpConn.GetStandardClient()
resp, err = stdClient.Get(httpConn.GetBaseURL() + "/health")
```

**Request Body Types:**

```go
// String body
req, err := httpConn.NewRequest(ctx, "POST", "/api/data", `{"key": "value"}`)

// Byte slice body
data := []byte(`{"key": "value"}`)
req, err := httpConn.NewRequest(ctx, "POST", "/api/data", data)

// Reader body
body := strings.NewReader(`{"key": "value"}`)
req, err := httpConn.NewRequest(ctx, "POST", "/api/data", body)

// No body
req, err := httpConn.NewRequest(ctx, "GET", "/api/data", nil)
```

### Health Monitoring

Monitor HTTP connection health with detailed status:

```go
// Check individual connection health
status := httpConn.HealthCheck(ctx)
fmt.Printf("State: %s\n", status.State)        // Ready, Live, Connected, Error
fmt.Printf("Latency: %v\n", status.Latency)    // Response time
fmt.Printf("Message: %s\n", status.Message)    // Detailed status message

// Monitor circuit breaker state
cbState := httpConn.GetCircuitBreakerState()   // Closed, Open, HalfOpen
fmt.Printf("Circuit Breaker: %s\n", cbState)

// Check all connections
healthStatus := registry.HealthCheck(ctx)
for name, status := range healthStatus {
    fmt.Printf("Connection '%s': %s\n", name, status)
}
```

**HTTP Health Check Logic:**

- Uses HEAD request to base URL (fast, minimal data transfer)
- Falls back to GET request if HEAD returns 405 (Method Not Allowed)
- Maps HTTP status codes to connection states:
  - **2xx**: Ready (healthy and ready to serve)
  - **429**: Live (healthy but rate-limited)
  - **503**: Connected (reachable but temporarily unavailable)
  - **4xx**: Connected (reachable but configuration issues)
  - **5xx**: Error (server errors)

### Environment Configuration

Configure HTTP connections via environment variables:

```bash
# Connection configuration
CONN_TARGETS_API_PROTOCOL=http
CONN_TARGETS_API_URL=https://api.example.com
CONN_TARGETS_API_TIMEOUT=30s
CONN_TARGETS_API_TLS=true

# Circuit breaker configuration
CONN_TARGETS_API_PROPERTIES_CIRCUIT_BREAKER_ENABLED=true
CONN_TARGETS_API_PROPERTIES_CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
CONN_TARGETS_API_PROPERTIES_CIRCUIT_BREAKER_RESET_TIMEOUT=60s
CONN_TARGETS_API_PROPERTIES_CIRCUIT_BREAKER_HALF_OPEN_SUCCESS_NEEDED=2

# Retry strategy configuration
CONN_TARGETS_API_PROPERTIES_RETRY_STRATEGY_ENABLED=true
CONN_TARGETS_API_PROPERTIES_RETRY_STRATEGY_MAX_ATTEMPTS=3
CONN_TARGETS_API_PROPERTIES_RETRY_STRATEGY_INITIAL_INTERVAL=100ms
CONN_TARGETS_API_PROPERTIES_RETRY_STRATEGY_MAX_INTERVAL=10s
CONN_TARGETS_API_PROPERTIES_RETRY_STRATEGY_MULTIPLIER=2.0
CONN_TARGETS_API_PROPERTIES_RETRY_STRATEGY_RANDOM_FACTOR=0.1

# Error threshold
CONN_TARGETS_API_PROPERTIES_SERVER_ERROR_THRESHOLD=500
```

### Error Handling

The resilient HTTP client provides comprehensive error handling:

```go
client := httpConn.GetClient()
resp, err := client.Do(req)

if err != nil {
    // Check for specific error types
    switch {
    case errors.Is(err, httpclient.ErrCircuitOpen):
        // Circuit breaker is open - service is down
        log.Warn("Service temporarily unavailable due to circuit breaker")

    case errors.Is(err, httpclient.ErrMaxRetries):
        // All retry attempts exhausted
        log.Error("Request failed after all retry attempts")

    case errors.Is(err, httpclient.ErrAllRetryAttemptsFailed):
        // All retries failed with transport errors
        log.Error("All retry attempts failed due to transport errors")

    default:
        // Other error (network, timeout, etc.)
        log.Error("Request failed", "error", err)
    }
    return err
}

// Check response status
if resp.StatusCode >= 400 {
    // Handle HTTP error responses
    log.Warn("HTTP error response", "status", resp.StatusCode)
}
```

### Performance Optimization

Optimize HTTP connections for your use case:

```go
// High-throughput configuration
_, err := registry.AddConnection(ctx, "api-high-throughput", &connfx.ConfigTarget{
    Protocol: "http",
    URL:      "https://api.example.com",
    Properties: map[string]any{
        // Disable circuit breaker for high-volume, predictable traffic
        "circuit_breaker": map[string]any{
            "enabled": false,
        },

        // Minimal retries for speed
        "retry_strategy": map[string]any{
            "enabled":          true,
            "max_attempts":     2,  // Only 1 retry
            "initial_interval": 50 * time.Millisecond,
            "multiplier":       1.5,
        },

        // More tolerant error threshold
        "server_error_threshold": 503, // Only 503/504 trigger failures
    },
})

// Fault-tolerant configuration
_, err = registry.AddConnection(ctx, "api-fault-tolerant", &connfx.ConfigTarget{
    Protocol: "http",
    URL:      "https://unreliable-api.example.com",
    Properties: map[string]any{
        // Aggressive circuit breaker
        "circuit_breaker": map[string]any{
            "enabled":                   true,
            "failure_threshold":         3,  // Trip quickly
            "reset_timeout":             10 * time.Second, // Reset quickly
            "half_open_success_needed":  1,  // Only need 1 success
        },

        // Aggressive retries
        "retry_strategy": map[string]any{
            "enabled":          true,
            "max_attempts":     5,  // Many retries
            "initial_interval": 500 * time.Millisecond,
            "max_interval":     60 * time.Second,
            "multiplier":       3.0, // Aggressive backoff
            "random_factor":    0.3, // High jitter
        },

        // Strict error threshold
        "server_error_threshold": 400, // Even 4xx errors trigger circuit breaker
    },
})
```

### Integration with Other Packages

Use resilient HTTP connections with other eser-go packages:

```go
// With httpfx for web servers
func MyHandler(ctx *httpfx.Context) httpfx.Result {
    // Get HTTP connection from registry
    conn, err := registry.GetConnection(ctx.Request.Context(), "external-api")
    if err != nil {
        return ctx.Results.InternalServerError("API unavailable")
    }

    httpConn := conn.(*connfx.HTTPConnection)
    req, err := httpConn.NewRequest(ctx.Request.Context(), "GET", "/data", nil)
    if err != nil {
        return ctx.Results.InternalServerError("Failed to create request")
    }

    client := httpConn.GetClient()
    resp, err := client.Do(req)
    if err != nil {
        if errors.Is(err, httpclient.ErrCircuitOpen) {
            return ctx.Results.ServiceUnavailable("External service temporarily unavailable")
        }
        return ctx.Results.InternalServerError("External API request failed")
    }
    defer resp.Body.Close()

    // Process response...
    return ctx.Results.JSON(data)
}

// With metrics for monitoring
metricsBuilder := metricsProvider.NewBuilder()
httpRequests, _ := metricsBuilder.Counter(
    "http_client_requests_total",
    "Total HTTP client requests",
).Build()

httpLatency, _ := metricsBuilder.Histogram(
    "http_client_duration_seconds",
    "HTTP client request duration",
).WithDurationBuckets().Build()

// Monitor HTTP requests
start := time.Now()
resp, err := client.Do(req)
duration := time.Since(start)

httpRequests.Inc(ctx,
    metricsfx.StringAttr("endpoint", req.URL.Path),
    metricsfx.StringAttr("method", req.Method),
    metricsfx.BoolAttr("success", err == nil),
)

httpLatency.RecordDuration(ctx, duration,
    metricsfx.StringAttr("endpoint", req.URL.Path),
)
```

### Best Practices

1. **Circuit Breaker Tuning**:
   - Set `failure_threshold` based on your service's failure tolerance
   - Use longer `reset_timeout` for external services, shorter for internal
     services
   - Require multiple successes (`half_open_success_needed`) before fully
     trusting recovery

2. **Retry Strategy**:
   - Use fewer retries (`max_attempts`) for user-facing requests to avoid
     latency
   - Use more retries for background/batch operations
   - Add jitter (`random_factor`) to prevent thundering herd effects

3. **Error Classification**:
   - Set appropriate `server_error_threshold` (typically 500)
   - Consider 4xx errors as non-retriable for most cases
   - Monitor circuit breaker states and adjust thresholds based on real traffic

4. **Connection Management**:
   - Reuse connections through the registry
   - Use different connection names for different service endpoints
   - Monitor connection health regularly

5. **Testing**:
   - Test circuit breaker behavior under load
   - Verify retry logic with network failures
   - Monitor latency impact of resilience features

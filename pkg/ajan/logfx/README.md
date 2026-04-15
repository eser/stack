# eser-go/logfx

## Overview

**logfx** package is a configurable logging solution that leverages the
`log/slog` of the standard library for structured logging. It includes
pretty-printing options and **OpenTelemetry integration** for log export to
modern observability platforms. The package supports OpenTelemetry-compatible
severity levels and provides extensive test coverage to ensure reliability and
correctness.

### Key Features

- 🎯 **Extended Log Levels** - OpenTelemetry-compatible levels while using
  standard `log/slog` under the hood
- 🔄 **Built-in Context Support** - Context-aware logging with automatic trace
  correlation
- 🌐 **OpenTelemetry Integration** - Direct OTLP export through `EnableOTLP()`
  method
- 📊 **Structured Logging** - JSON output for production, pretty printing for
  development
- 🎨 **Pretty Printing** - Colored output for development
- ⚡ **Performance Optimized** - Built on standard library foundations
- 🎛️ **Flexible Configuration** - Multiple configuration options and runtime
  settings

## 🚀 **Extended Log Levels**

**The Problem**: Go's standard `log/slog` package provides only 4 log levels
(Debug, Info, Warn, Error), which is insufficient for modern observability and
OpenTelemetry compatibility.

**The Solution**: logfx extends the standard library to provide **7
OpenTelemetry-compatible log levels** while maintaining full compatibility with
`log/slog`:

```go
// Standard Go slog levels (limited)
slog.LevelDebug  // -4
slog.LevelInfo   //  0
slog.LevelWarn   //  4
slog.LevelError  //  8

// logfx extended levels (OpenTelemetry compatible)
logfx.LevelTrace // -8  ← Additional
logfx.LevelDebug // -4
logfx.LevelInfo  //  0
logfx.LevelWarn  //  4
logfx.LevelError //  8
logfx.LevelFatal // 12  ← Additional
logfx.LevelPanic // 16  ← Additional
```

### Why This Matters

1. **OpenTelemetry Compatibility** - Maps perfectly to OpenTelemetry log
   severity levels
2. **Better Observability** - More granular log levels for better debugging and
   monitoring
3. **Standard Library Foundation** - Built on `log/slog`, not a replacement
4. **Zero Breaking Changes** - Existing slog code works unchanged
5. **Proper Severity Mapping** - Correct OTLP export with appropriate severity
   levels

### Extended Level Usage

```go
import "github.com/eser/stack/pkg/eser-go/logfx"

logger := logfx.NewLogger(
    logfx.WithLevel(logfx.LevelTrace), // Now supports all 7 levels
)

// Use all OpenTelemetry-compatible levels
logger.Trace("Detailed debugging info")           // Most verbose
logger.Debug("Debug information")                 // Development debugging
logger.Info("General information")                // Standard info
logger.Warn("Warning message")                    // Potential issues
logger.Error("Error occurred")                    // Errors that don't stop execution
logger.Fatal("Fatal error")                       // Critical errors
logger.Panic("Panic condition")                   // Most severe

// Context-aware logging
ctx := context.Background()
logger.TraceContext(ctx, "Context-aware trace message")
logger.FatalContext(ctx, "Context-aware fatal message")
logger.PanicContext(ctx, "Context-aware panic message")
```

**Colored Output** (development mode):

```bash
23:45:12.123 TRACE Detailed debugging info
23:45:12.124 DEBUG Debug information
23:45:12.125 INFO General information
23:45:12.126 WARN Warning message
23:45:12.127 ERROR Error occurred
23:45:12.128 FATAL Fatal error
23:45:12.129 PANIC Panic condition
```

**Structured Output** (production mode):

```json
{"time":"2024-01-15T23:45:12.123Z","level":"TRACE","msg":"Detailed debugging info"}
{"time":"2024-01-15T23:45:12.124Z","level":"DEBUG","msg":"Debug information"}
{"time":"2024-01-15T23:45:12.125Z","level":"INFO","msg":"General information"}
{"time":"2024-01-15T23:45:12.126Z","level":"WARN","msg":"Warning message"}
{"time":"2024-01-15T23:45:12.127Z","level":"ERROR","msg":"Error occurred"}
{"time":"2024-01-15T23:45:12.128Z","level":"FATAL","msg":"Fatal error"}
{"time":"2024-01-15T23:45:12.129Z","level":"PANIC","msg":"Panic condition"}
```

## Quick Start

### Basic Usage

```go
package main

import (
    "context"
    "log/slog"

    "github.com/eser/stack/pkg/eser-go/logfx"
)

func main() {
    // Create basic logger with defaults
    logger := logfx.NewLogger()

    // Use structured logging with extended levels
    logger.Info("Application started",
        slog.String("service", "my-service"),
        slog.String("version", "1.0.0"),
    )

    // Extended levels for better observability
    logger.Trace("Connection pool initialized")     // Very detailed
    logger.Debug("Processing user request")         // Debug info
    logger.Warn("High memory usage detected")       // Warnings
    logger.Fatal("Database connection failed")      // Critical errors
}
```

### Advanced Configuration

```go
package main

import (
    "context"
    "log/slog"
    "os"

    "github.com/eser/stack/pkg/eser-go/logfx"
)

func main() {
    // Create logger with custom configuration
    logger := logfx.NewLogger(
        logfx.WithScopeName("my-service"),
        logfx.WithConfig(&logfx.Config{
            Level:      "TRACE",
            PrettyMode: true,
            AddSource:  true,
        }),
        logfx.WithWriter(os.Stdout),
        logfx.WithDefaultLogger(), // Set as default slog logger
    )

    // Context-aware logging
    ctx := context.Background()
    logger.InfoContext(ctx, "Processing request",
        slog.String("user_id", "123"),
        slog.String("action", "login"),
    )
}
```

### OpenTelemetry Integration

```go
package main

import (
    "context"

    "github.com/eser/stack/pkg/eser-go/logfx"
)

func main() {
    // Create logger
    logger := logfx.NewLogger(
        logfx.WithScopeName("my-service"),
    )

    // Enable OpenTelemetry export with connection resource
    // Note: You need to implement OTLPConnectionResource interface
    // or use a connection provider from your application
    var otlpConn logfx.OTLPConnectionResource
    logger.EnableOTLP(otlpConn)

    // Now all logs are exported to OpenTelemetry
    logger.Info("Application started with OTLP export enabled")
}
```

## Configuration

### Configuration Structure

```go
type Config struct {
    Level                         string `conf:"level" default:"INFO"`
    DefaultLogger                 bool   `conf:"default"    default:"false"`
    PrettyMode                   bool   `conf:"pretty"     default:"true"`
    AddSource                    bool   `conf:"add_source" default:"false"`
    NoNativeCollectorRegistration bool   `conf:"no_native_collector_registration" default:"false"`
}
```

### Configuration Options

- **Level**: Log level - supports `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`,
  `FATAL`, `PANIC`
- **DefaultLogger**: Set this logger as the default `slog` logger
- **PrettyMode**: Enable colored, human-readable output (vs JSON)
- **AddSource**: Include source code location in log entries
- **NoNativeCollectorRegistration**: Disable native OpenTelemetry collector
  registration

### Environment-Based Configuration

```go
// Configure via struct
config := &logfx.Config{
    Level:         "DEBUG",
    PrettyMode:    false,
    AddSource:     true,
    DefaultLogger: true,
}

logger := logfx.NewLogger(logfx.WithConfig(config))
```

## API Reference

### Logger Creation

#### NewLogger (Options Pattern)

```go
func NewLogger(options ...NewLoggerOption) *Logger
```

Create a logger using the flexible options pattern:

```go
// Basic logger with default configuration
logger := logfx.NewLogger()

// Logger with custom scope name
logger := logfx.NewLogger(
    logfx.WithScopeName("my-service"),
)

// Logger with full configuration
logger := logfx.NewLogger(
    logfx.WithConfig(&logfx.Config{
        Level:      "DEBUG",
        PrettyMode: true,
        AddSource:  true,
    }),
    logfx.WithWriter(os.Stderr),
    logfx.WithDefaultLogger(),
)

// Logger from existing slog.Logger
existingSlog := slog.New(slog.NewJSONHandler(os.Stdout, nil))
logger := logfx.NewLogger(
    logfx.WithFromSlog(existingSlog),
)
```

### Available Options

```go
// Core configuration
WithScopeName(scopeName string)              // Set OpenTelemetry scope name
WithConfig(config *Config)                   // Full configuration
WithLevel(level slog.Level)                  // Set log level
WithDefaultLogger()                          // Set as default slog logger

// Output configuration
WithWriter(writer io.Writer)                 // Set output writer
WithFromSlog(slog *slog.Logger)             // Wrap existing slog.Logger
WithPrettyMode(pretty bool)                  // Enable/disable pretty printing
WithAddSource(addSource bool)                // Include source code location
```

### Extended Logging Methods

All standard `slog` methods are available, plus extended methods:

```go
// Standard slog methods (inherited)
logger.Debug("message", slog.String("key", "value"))
logger.Info("message", slog.String("key", "value"))
logger.Warn("message", slog.String("key", "value"))
logger.Error("message", slog.String("key", "value"))

// Extended methods with context support
logger.Trace("trace message")
logger.TraceContext(ctx, "trace with context")

logger.Fatal("fatal message")
logger.FatalContext(ctx, "fatal with context")

logger.Panic("panic message")
logger.PanicContext(ctx, "panic with context")
```

### OpenTelemetry Features

#### OTLP Integration

```go
// Enable OpenTelemetry export
logger.EnableOTLP(otlpConnectionResource)
```

#### Tracing Integration

```go
// Start a span with automatic trace correlation
ctx, span := logger.StartSpan(ctx, "operation-name",
    slog.String("user_id", "123"),
)
defer span.End()

// Logs within this span will automatically include trace information
logger.InfoContext(ctx, "Processing within span")
```

#### Metrics Integration

```go
// Create metrics builder for this logger's scope
metricsBuilder := logger.NewMetricsBuilder("my-metrics")
// Use metricsBuilder to create custom metrics
```

#### Propagation Support

```go
import "net/http"

// Extract propagation context from HTTP headers
ctx = logger.PropagatorExtract(ctx, request.Header)

// Inject propagation context into HTTP headers
logger.PropagatorInject(ctx, response.Header)
```

### OTLPConnectionResource Interface

To enable OpenTelemetry export, implement this interface:

```go
type OTLPConnectionResource interface {
    GetLoggerProvider() *sdklog.LoggerProvider
    GetMeterProvider() *sdkmetric.MeterProvider
    GetTracerProvider() *sdktrace.TracerProvider
}
```

## Level Configuration Examples

```go
// Development - verbose logging with all levels
devLogger := logfx.NewLogger(
    logfx.WithLevel(logfx.LevelTrace),    // Most verbose - see everything
    logfx.WithPrettyMode(true),
    logfx.WithAddSource(true),
)

// Production - structured output with appropriate level
prodLogger := logfx.NewLogger(
    logfx.WithLevel(logfx.LevelInfo),     // Production appropriate
    logfx.WithPrettyMode(false),
    logfx.WithAddSource(false),
)

// Debug production issues - temporary verbose logging
debugLogger := logfx.NewLogger(
    logfx.WithLevel(logfx.LevelDebug),    // More detail for troubleshooting
    logfx.WithPrettyMode(false),
)
```

### Standard Library Compatibility

```go
// logfx extends slog.Level, so standard slog works unchanged
import "log/slog"

// This works exactly as before
slog.Info("Standard slog message")
slog.Debug("Debug with standard slog")

// But you can also use extended levels through logfx
logger.Trace("Extended trace level")    // Not available in standard slog
logger.Fatal("Extended fatal level")    // Not available in standard slog
logger.Panic("Extended panic level")    // Not available in standard slog
```

## Error Handling

The logger handles errors gracefully:

```go
// Logger continues working even if OpenTelemetry fails
logger := logfx.NewLogger(
    logfx.WithWriter(os.Stdout),
)

// If OTLP connection fails, logger falls back to local output only
// Connection failures are handled gracefully without affecting your app
logger.Info("This will always work, with or without OTLP")
```

## Best Practices

1. **Use Scoped Loggers**: Set meaningful scope names for different components
2. **Context Propagation**: Use context-aware methods (`*Context`) for trace
   correlation
3. **Structured Logging**: Use `slog.String()`, `slog.Int()` etc. for structured
   attributes
4. **Appropriate Levels**: Use the right level for the right situation
5. **Source Information**: Enable `AddSource` only in development (performance
   impact)
6. **OTLP Integration**: Implement proper connection lifecycle management
7. **Default Logger**: Use `WithDefaultLogger()` to integrate with existing
   `slog` code

## Architecture Benefits

- **Standard Library Foundation** - Built on `log/slog` for compatibility and
  performance
- **Extended Observability** - 7 OpenTelemetry-compatible log levels
- **Context Integration** - Native support for Go contexts and trace correlation
- **Flexible Configuration** - Multiple ways to configure behavior
- **OpenTelemetry Ready** - Direct integration with OpenTelemetry ecosystem
- **Zero Dependencies** - Only depends on standard library and OpenTelemetry
- **Thread Safety** - All operations are thread-safe
- **Performance Optimized** - Minimal overhead over standard `slog`

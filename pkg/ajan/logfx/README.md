# 📝 [ajan/logfx](./)

> **eserstack Go library** in the root module `github.com/eser/stack`. Import
> `github.com/eser/stack/pkg/ajan/logfx`. The module is not published for
> `go get`: build inside this repository, or require `github.com/eser/stack`
> with a `replace` directive that points at a checkout.

**logfx** package is a configurable logging package built on the standard
library's `log/slog` for structured logging in ajan services. It includes
pretty-printing options for development, JSON output for production,
OpenTelemetry-compatible severity levels, and **OpenTelemetry integration** that
exports logs, metrics and traces over OTLP. A `*logfx.Logger` embeds
`*slog.Logger`, so code that takes a `*slog.Logger` takes it too.

## Key Features

- 🎯 Extended log levels: OpenTelemetry-compatible Trace, Fatal and Panic levels
  while using standard `log/slog` under the hood
- 🔄 Built-in context support: the `*Context` methods add the `trace_id` and
  `span_id` of the active span to the record
- 🌐 OpenTelemetry integration: OTLP export of logs, metrics and traces through
  the `EnableOTLP()` method
- 📊 Structured logging: JSON output for production, pretty printing for
  development
- 🎨 Pretty printing: colored output for development
- ⚡ Standard library base: `Logger` embeds `*slog.Logger`, so code that takes a
  `*slog.Logger` accepts `logger.Logger`
- 🎛️ Configuration: a `Config` struct that configfx loads, and functional
  options

## Quick Start

Create a logger and log with the `*Context` methods:

```go
package main

import (
	"context"
	"log/slog"

	"github.com/eser/stack/pkg/ajan/logfx"
)

func main() {
	ctx := context.Background()

	logger := logfx.NewLogger(logfx.WithPrettyMode(true))

	logger.InfoContext(ctx, "application started",
		slog.String("service", "my-service"),
		slog.String("version", "1.0.0"),
	)
	logger.WarnContext(ctx, "high memory usage detected", slog.Int("percent", 91))
}
```

It prints colored lines to standard output (colors not shown):

```text
03:34:47.625 INFO    application started
	service                  = my-service
	version                  = 1.0.0

03:34:47.625 WARN    high memory usage detected
	percent                  = 91
```

Without `WithPrettyMode(true)`, `NewLogger` writes one JSON object per record,
at level `INFO` and above, to standard output.

## 🚀 Extended Log Levels

Go's standard `log/slog` package names four levels (Debug, Info, Warn, Error).
OpenTelemetry log severities also have Trace and Fatal, so logfx adds three
levels as plain `slog.Level` values:

```go
// Standard Go slog levels
slog.LevelDebug // -4
slog.LevelInfo  //  0
slog.LevelWarn  //  4
slog.LevelError //  8

// logfx extended levels (OpenTelemetry compatible)
logfx.LevelTrace // -8  ← Additional
logfx.LevelDebug // -4
logfx.LevelInfo  //  0
logfx.LevelWarn  //  4
logfx.LevelError //  8
logfx.LevelFatal // 12  ← Additional
logfx.LevelPanic // 16  ← Additional
```

### How the Levels Map

- The output prints the level names `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`,
  `FATAL` and `PANIC`. A level between two names prints with an offset, such as
  `INFO+2`.
- The OTLP export maps them to the OpenTelemetry severities Trace, Debug, Info,
  Warn, Error and Fatal; Panic is exported as Fatal.
- Because they are `slog.Level` values, existing slog code works unchanged and
  `logger.Log(ctx, logfx.LevelTrace, ...)` works on any `slog.Logger`.

### Extended Level Usage

```go
logger := logfx.NewLogger(
	logfx.WithLevel(logfx.LevelTrace), // Enables all 7 levels
)

logger.TraceContext(ctx, "detailed debugging info") // Most verbose
logger.DebugContext(ctx, "debug information")
logger.InfoContext(ctx, "general information")
logger.WarnContext(ctx, "warning message")
logger.ErrorContext(ctx, "error occurred")
logger.FatalContext(ctx, "fatal error")
logger.PanicContext(ctx, "panic condition") // Most severe
```

`Trace`, `Fatal` and `Panic` also have forms without a context. The `Fatal*` and
`Panic*` methods only write the record at their level: they do not exit the
process or panic. Return the error and exit from `main` when the program has to
stop.

**Structured Output** (JSON mode):

```json
{"time":"2026-10-05T03:34:47.625966+03:00","level":"TRACE","msg":"detailed debugging info"}
{"time":"2026-10-05T03:34:47.62597+03:00","level":"FATAL","msg":"fatal error"}
```

## Configuration

### Configuration Structure

```go
type Config struct {
	Level string `conf:"level" default:"INFO"`

	DefaultLogger bool `conf:"default"    default:"false"`
	PrettyMode    bool `conf:"pretty"     default:"true"`
	AddSource     bool `conf:"add_source" default:"false"`

	NoNativeCollectorRegistration bool `conf:"no_native_collector_registration" default:"false"`
}
```

### Configuration Options

- `Level`: the minimum level, one of `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`,
  `FATAL` and `PANIC` in any case, with an optional offset such as `DEBUG+1`. A
  name that does not parse falls back to `INFO`, and the logger writes a `WARN`
  record that names the bad value.
- `DefaultLogger`: set this logger as the default `slog` logger
  (`slog.SetDefault`), so `slog.Info` and the `log` package write through it.
- `PrettyMode`: colored, human-readable output instead of JSON.
- `AddSource`: include the source file and line in JSON records.
- `NoNativeCollectorRegistration`: part of the struct, but no code reads it.

The `default` tags apply when configfx loads the struct, so a loaded config is
pretty by default. `NewLogger` without `WithConfig` starts from `Level: "INFO"`
and every other field false, which means JSON output.

### Loading the Configuration

Embed `Config` in your config struct and pass the loaded value to `WithConfig`.
Under a `conf:"log"` field, `log__level=DEBUG` and `log__pretty=false` set it
from the environment:

```go
type AppConfig struct {
	Log logfx.Config `conf:"log"`
}

func newLogger() (*logfx.Logger, error) {
	config := &AppConfig{}

	err := configfx.NewConfigManager().LoadDefaults(config)
	if err != nil {
		return nil, fmt.Errorf("load config: %w", err)
	}

	return logfx.NewLogger(logfx.WithConfig(&config.Log)), nil
}
```

## API Reference

### Logger Creation

#### NewLogger (Options Pattern)

```go
func NewLogger(options ...NewLoggerOption) *Logger
```

Options apply in order. `WithConfig` replaces the whole configuration, so pass
it before the options that change one field:

```go
// Basic logger: JSON, INFO and above, standard output
logger := logfx.NewLogger()

// Logger with custom scope name
logger = logfx.NewLogger(
	logfx.WithScopeName("my-service"),
)

// Logger with full configuration
logger = logfx.NewLogger(
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
logger = logfx.NewLogger(
	logfx.WithFromSlog(existingSlog),
)
```

A logger built with `WithFromSlog` writes through the handler you gave it, so
the logfx output modes and `EnableOTLP` do not apply to it.

### Available Options

```go
// Core configuration
WithScopeName(scopeName string) // OpenTelemetry scope name (default "default")
WithConfig(config *Config)      // Full configuration
WithLevel(level slog.Level)     // Set log level
WithDefaultLogger()             // Set as default slog logger

// Output configuration
WithWriter(writer io.Writer)     // Set output writer (default os.Stdout)
WithFromSlog(slog *slog.Logger)  // Wrap existing slog.Logger
WithPrettyMode(pretty bool)      // Enable/disable pretty printing
WithAddSource(addSource bool)    // Include source code location
```

### Extended Logging Methods

All standard `slog` methods are available, plus extended methods:

```go
// Standard slog methods (inherited)
logger.DebugContext(ctx, "message", slog.String("key", "value"))
logger.InfoContext(ctx, "message", slog.String("key", "value"))
logger.WarnContext(ctx, "message", slog.String("key", "value"))
logger.ErrorContext(ctx, "message", slog.String("key", "value"))

// Extended methods with context support
logger.Trace("trace message")
logger.TraceContext(ctx, "trace with context")

logger.Fatal("fatal message")
logger.FatalContext(ctx, "fatal with context")

logger.Panic("panic message")
logger.PanicContext(ctx, "panic with context")

// Printf-style, for code that expects a Printf logger
logger.Printf("processed %d items", 42) // INFO
```

### Attributes and Groups

Attach request or entity ids once with `With`, and nest related fields with
`WithGroup`. Both output modes keep them:

```go
requestLogger := logger.With("request_id", "r-1").WithGroup("http")
requestLogger.InfoContext(ctx, "request handled", "status", 200)
```

Pretty mode prints the attributes added with `With` first, then the record's
own, one per line, with group names joined by dots:

```text
01:05:23.308 INFO    request handled
	request_id               = r-1
	http.status              = 200
```

JSON mode nests each group as an object (formatted here; the output is one line
per record):

```json
{
  "time": "2026-10-05T01:05:23.309+03:00",
  "level": "INFO",
  "msg": "request handled",
  "request_id": "r-1",
  "http": { "status": 200 }
}
```

Subscribers added with `Handler.AddSubscriber`, the OTLP export among them,
receive the same attributes with the dotted keys that pretty mode prints.

In JSON mode, an attribute whose value is an `error` is written as an object
with a `msg` key, plus a `trace` key when the error carries a stack trace
(`StackTrace() logfx.StackTrace`).

### OpenTelemetry Features

#### OTLP Integration

`EnableOTLP` takes a resource that holds the OpenTelemetry logger, meter and
tracer providers. [connfx](../connfx/README.md) builds one from an `otlp`
connection:

```go
func enableOTLP(
	ctx context.Context,
	logger *logfx.Logger,
	registry *connfx.Registry,
) (*connfx.OTLPConnectionResource, error) {
	conn, err := registry.AddConnection(ctx, "otel", &connfx.ConfigTarget{
		Protocol: "otlp",
		DSN:      "localhost:4318",
	})
	if err != nil {
		return nil, fmt.Errorf("add OTLP connection: %w", err)
	}

	otlpConn, ok := conn.(*connfx.OTLPConnection)
	if !ok {
		return nil, fmt.Errorf("connection %q is not OTLP", "otel")
	}

	resource, err := otlpConn.CreateResource("my-service", "1.0.0", "production")
	if err != nil {
		return nil, fmt.Errorf("create OTLP resource: %w", err)
	}

	logger.EnableOTLP(resource)

	return resource, nil
}
```

Every record after `EnableOTLP` is also exported, and `StartSpan` and
`NewMetricsBuilder` use the OTLP providers. Call `resource.Close(ctx)` at
shutdown to flush what is still buffered. `EnableOTLP` panics when the resource
is nil or the logger was built with `WithFromSlog`.

#### Tracing Integration

```go
// Start a span; pass attributes as slog.Attr values
ctx, span := logger.StartSpan(ctx, "operation-name",
	slog.String("user_id", "123"),
)
defer span.End()

// Records logged with this ctx carry trace_id and span_id
logger.InfoContext(ctx, "processing within span")

span.RecordError(err) // records the error and sets the span status to Error
```

`Span` also has `GetTraceID`, `GetSpanID`, `SetAttributes` and `AddEvent`.
Before `EnableOTLP`, `StartSpan` uses a no-op provider, whose spans have no
trace ids of their own.

#### Metrics Integration

```go
// Create metrics builder for this logger's scope
metricsBuilder := logger.NewMetricsBuilder("my-metrics")

requests, err := metricsBuilder.Counter(
	"http_client_requests_total", "Total HTTP client requests",
).Build()
if err != nil {
	return fmt.Errorf("build counter: %w", err)
}

latency, err := metricsBuilder.Histogram(
	"http_client_duration_seconds", "HTTP client request duration",
).WithDurationBuckets().Build()
if err != nil {
	return fmt.Errorf("build histogram: %w", err)
}

requests.Inc(ctx, slog.String("method", "GET"))
latency.RecordDuration(ctx, 120*time.Millisecond)
```

`Gauge` builds a gauge with `Set` and `SetBool`. Create builders after
`EnableOTLP`; a builder made before it keeps the no-op provider until you call
its `Bind` method with the new meter provider.

#### Propagation Support

The propagator reads and writes W3C Trace Context and Baggage headers:

```go
// Extract propagation context from incoming HTTP headers
ctx = logger.PropagatorExtract(ctx, request.Header)

// Inject propagation context into outgoing HTTP headers
logger.PropagatorInject(ctx, outgoing.Header)
```

### OTLPConnectionResource Interface

`EnableOTLP` accepts any value with these methods;
`*connfx.OTLPConnectionResource` is the one this codebase provides:

```go
type OTLPConnectionResource interface {
	GetLoggerProvider() *sdklog.LoggerProvider
	GetMeterProvider() *sdkmetric.MeterProvider
	GetTracerProvider() *sdktrace.TracerProvider
}
```

### Filters, Formatters and Category Levels

The package also holds building blocks that the `@eserstack/ajan` bridge uses
for the loggers it exposes to TypeScript; `NewLogger` does not apply them:

- Filters (`FilterFunc`): `LevelFilter`, `CategoryPrefixFilter`,
  `RateLimitFilter`, `SamplingFilter`, combined with `ChainFilters`.
- Formatters (`FormatterFunc`): `JSONFormatter`, `TextFormatter`, and
  `SpanFormatter`, which appends `trace_id` and `span_id`.
- Category levels: `Configure` stores dot-separated category routes, and
  `EffectiveLevel` returns the level of the longest matching prefix
  (`myapp.http` matches `myapp.http.server` but not `myapp.httpx`).

## Level Configuration Examples

```go
// Development: verbose logging with all levels
devLogger := logfx.NewLogger(
	logfx.WithLevel(logfx.LevelTrace),
	logfx.WithPrettyMode(true),
	logfx.WithAddSource(true),
)

// Production: structured output at INFO and above
prodLogger := logfx.NewLogger(
	logfx.WithLevel(logfx.LevelInfo),
	logfx.WithPrettyMode(false),
)

// Debugging production issues: temporary verbose logging
debugLogger := logfx.NewLogger(
	logfx.WithLevel(logfx.LevelDebug),
	logfx.WithPrettyMode(false),
)
```

### Standard Library Compatibility

```go
logger := logfx.NewLogger(logfx.WithDefaultLogger())

// The standard slog functions now write through logfx
slog.InfoContext(ctx, "standard slog message")

// The extended levels are plain slog.Level values
slog.Log(ctx, logfx.LevelTrace, "trace through the standard logger")
logger.TraceContext(ctx, "extended trace level")
```

## Error Handling

A record that fails to write returns an error wrapping
`logfx.ErrFailedToWriteLog` from the handler, and a subscriber error wraps
`logfx.ErrFailedToHandleLog`; `slog` drops both, as it does for every handler.
The OTLP export runs as a subscriber that hands each record to the logger
provider, whose batch processor sends it in the background, so a collector that
is down does not block or fail the local output.

## Best Practices

1. **Use Scoped Loggers**: Set meaningful scope names for different components
2. **Context Propagation**: Use context-aware methods (`*Context`) for trace
   correlation
3. **Structured Logging**: Use `slog.String()`, `slog.Int()` etc. for structured
   attributes
4. **Appropriate Levels**: Use the right level for the right situation
5. **Source Information**: Enable `AddSource` only in development, since it
   looks up the caller for every record
6. **OTLP Integration**: Close the OTLP resource at shutdown so buffered records
   are sent
7. **Default Logger**: Use `WithDefaultLogger()` to integrate with existing
   `slog` code

## Concurrency

Logging methods can be called from any number of goroutines, as with any
`slog.Logger`. Set up the logger, including `EnableOTLP` and
`Handler.AddSubscriber`, before other goroutines log through it: those calls
change the handler without locking.

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- Subscribers registered with `Handler.AddSubscriber`, including the OTLP
  export, get the attributes of `WithAttrs` and `WithGroup` flattened to dotted
  keys, and pretty and subscriber records under an open group carry `trace_id`
  and `span_id` under the group prefix. Before: `trace_id`. After:
  `http.trace_id` on a logger grouped as `http`.

## 🔗 Links

- `go doc github.com/eser/stack/pkg/ajan/logfx`: the API reference generated
  from source
- [ajan/connfx](../connfx/README.md): the OTLP connection that `EnableOTLP`
  exports through
- [ajan/configfx](../configfx/README.md): loads `Config` from files and the
  environment
- [eser/stack on GitHub](https://github.com/eser/stack)

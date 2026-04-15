# 📝 [@eserstack/logging](./)

> **eserstack Library** — [eser/stack on GitHub](https://github.com/eser/stack)
> **Install:** `pnpm add jsr:@eserstack/logging`

`@eserstack/logging` is a hierarchical, category-based logging library with
context propagation, multiple sinks, filters, and OpenTelemetry integration.
Inspired by logtape, it provides a flexible and powerful logging solution for
modern TypeScript/JavaScript applications.

Sinks integrate with `@eserstack/streams` for rendering — choose ANSI, Markdown,
or plain text output by plugging in the appropriate renderer.

## Features

- **Hierarchical Categories** - Organize loggers in a tree structure like
  `["app", "http", "request"]`
- **Context Propagation** - Automatically include request IDs, trace IDs, and
  other context in logs
- **Multiple Sinks** - Route logs to stdout, writable streams, files, or custom
  destinations via `@eserstack/streams`
- **Filters** - Filter logs by severity, category, properties, or custom logic
- **OpenTelemetry Integration** - Automatic correlation with distributed traces
- **OpenTelemetry Severity Levels** - 9 standard severity levels (Trace to
  Emergency)
- **Lazy Evaluation** - Expensive log messages only computed when needed
- **Span-based Formatting** - Structured `Span[]` output that adapts to any
  renderer (ANSI, Markdown, plain)
- **Namespace Exports** - Clean API with `logging.config`, `logging.sinks`, etc.
- **TypeScript First** - Full type safety with proper type definitions

## Quick Start

```typescript
import * as logging from "@eserstack/logging";
import * as streams from "@eserstack/streams";

// Create an Output with a renderer and sink
const out = streams.output({
  renderer: streams.renderers.ansi(),
  sink: streams.sinks.stdout(),
});

// Configure once at app startup
await logging.config.configure({
  sinks: {
    console: logging.sinks.getOutputSink(out),
  },
  loggers: [
    {
      category: ["myapp"],
      lowestLevel: logging.Severities.Debug,
      sinks: ["console"],
    },
  ],
});

// Get a logger by category
const logger = logging.logger.getLogger(["myapp", "http"]);
await logger.info("Server started on port 3000");

// Create child loggers
const requestLogger = logger.getChild("request");
await requestLogger.debug("Processing request");
```

## Severity Levels (OpenTelemetry)

| Level     | Value | Description                        |
| --------- | ----- | ---------------------------------- |
| Trace     | 1     | Most fine-grained diagnostic info  |
| Debug     | 5     | Detailed troubleshooting data      |
| Info      | 9     | Normal operational messages        |
| Notice    | 10    | Normal but significant condition   |
| Warning   | 13    | Potential issues needing attention |
| Error     | 17    | Functionality-breaking problems    |
| Critical  | 21    | Non-recoverable critical failures  |
| Alert     | 22    | Action must be taken immediately   |
| Emergency | 23    | System is unusable (most severe)   |

> Higher severity numbers indicate more severe conditions (OpenTelemetry model).

## Usage Examples

### Hierarchical Categories

```typescript
import * as logging from "@eserstack/logging";
import * as streams from "@eserstack/streams";

const out = streams.output({
  renderer: streams.renderers.ansi(),
  sink: streams.sinks.stdout(),
});

await logging.config.configure({
  sinks: { console: logging.sinks.getOutputSink(out) },
  loggers: [
    {
      category: ["app"],
      sinks: ["console"],
      lowestLevel: logging.Severities.Info,
    },
    { category: ["app", "db"], lowestLevel: logging.Severities.Debug }, // inherits console sink
  ],
});

const appLogger = logging.logger.getLogger(["app"]);
const dbLogger = logging.logger.getLogger(["app", "db"]);
const queryLogger = dbLogger.getChild("query");

await appLogger.info("Application started");
await dbLogger.debug("Database connected");
await queryLogger.debug("Executing query: SELECT * FROM users");
```

### Context Propagation

```typescript
import * as logging from "@eserstack/logging";
import * as streams from "@eserstack/streams";

const out = streams.output({
  renderer: streams.renderers.ansi(),
  sink: streams.sinks.stdout(),
});

await logging.config.configure({
  sinks: { console: logging.sinks.getOutputSink(out) },
  loggers: [{
    category: ["app"],
    sinks: ["console"],
    lowestLevel: logging.Severities.Debug,
  }],
});

async function handleRequest(req: Request) {
  // All logs within this callback include requestId automatically
  await logging.context.withContext(
    { requestId: req.headers.get("x-request-id") },
    async () => {
      const logger = logging.logger.getLogger(["app", "handler"]);
      await logger.info("Processing request");
      await processRequest(req);
      await logger.info("Request completed");
    },
  );
}
```

### Logger with Properties

```typescript
import * as logging from "@eserstack/logging";

const logger = logging.logger.getLogger(["app"]);

// Create a logger with preset properties
const userLogger = logger.with({ userId: 123, role: "admin" });

await userLogger.info("User action"); // Includes userId and role
await userLogger.warn("Permission denied");
```

### Multiple Sinks

```typescript
import * as logging from "@eserstack/logging";
import * as streams from "@eserstack/streams";

// ANSI-colored output for the terminal
const terminalOut = streams.output({
  renderer: streams.renderers.ansi(),
  sink: streams.sinks.stdout(),
});

// Plain-text output routed to a writable stream (e.g. a file)
const fileOut = streams.output({
  renderer: streams.renderers.plain(),
  sink: streams.sinks.writable(fileStream),
});

await logging.config.configure({
  sinks: {
    console: logging.sinks.getOutputSink(terminalOut),
    file: logging.sinks.getOutputSink(fileOut),
  },
  loggers: [
    {
      category: ["app"],
      sinks: ["console"],
      lowestLevel: logging.Severities.Debug,
    },
    {
      category: ["app", "audit"],
      sinks: ["console", "file"],
      lowestLevel: logging.Severities.Info,
    },
  ],
});
```

### Filters

```typescript
import * as logging from "@eserstack/logging";
import * as streams from "@eserstack/streams";

const out = streams.output({
  renderer: streams.renderers.ansi(),
  sink: streams.sinks.stdout(),
});

await logging.config.configure({
  sinks: { console: logging.sinks.getOutputSink(out) },
  filters: {
    production: logging.filters.getLevelFilter(logging.Severities.Warning),
    httpOnly: logging.filters.getCategoryFilter(["app", "http"]),
  },
  loggers: [
    { category: ["app"], sinks: ["console"], filters: ["production"] },
  ],
});
```

### OpenTelemetry Integration

```typescript
import * as logging from "@eserstack/logging";

// Logs automatically include traceId and spanId
await logging.tracer.withSpan("process-order", async (span) => {
  const logger = logging.logger.getLogger(["app", "orders"]);
  span.setAttribute("order.id", orderId);

  await logger.info("Processing order");
  await processOrder(orderId);
  await logger.info("Order completed");
});
```

### Lazy Evaluation

```typescript
import * as logging from "@eserstack/logging";

const logger = logging.logger.getLogger(["app"]);

// Function only called if debug level is enabled
await logger.debug(() => {
  const expensiveData = computeExpensiveDebugInfo();
  return `Debug data: ${JSON.stringify(expensiveData)}`;
});
```

### Custom Formatters

```typescript
import * as logging from "@eserstack/logging";
import * as streams from "@eserstack/streams";

// Use the built-in spanFormatter with a plain renderer
const out = streams.output({
  renderer: streams.renderers.plain(),
  sink: streams.sinks.stdout(),
});

await logging.config.configure({
  sinks: {
    console: logging.sinks.getOutputSink(out),
  },
  loggers: [{ category: ["app"], sinks: ["console"] }],
});

// Or use a string-based formatter with getOutputSink
const customFormatter = (record: logging.LogRecord) => {
  return `[${record.datetime.toISOString()}] ${
    record.category.join(".")
  } - ${record.message}\n`;
};
```

### Testing with Record Collector

```typescript
import * as logging from "@eserstack/logging";

const { sink, records } = logging.sinks.getRecordCollectorSink();

await logging.config.configure({
  sinks: { test: sink },
  loggers: [
    {
      category: ["app"],
      sinks: ["test"],
      lowestLevel: logging.Severities.Debug,
    },
  ],
});

const logger = logging.logger.getLogger(["app"]);
await logger.info("hello");

console.assert(records.length === 1);
console.assert(records[0].message === "hello");
```

## API Reference

### Namespaces

The library exports these namespaces:

| Namespace            | Description                                         |
| -------------------- | --------------------------------------------------- |
| `logging.config`     | Configuration: `configure()`, `reset()`             |
| `logging.logger`     | Logger: `getLogger()`, `Logger` class               |
| `logging.context`    | Context: `withContext()`, `getContext()`            |
| `logging.sinks`      | Sinks: `getOutputSink()`, `getBufferedSink()`, etc. |
| `logging.filters`    | Filters: `getLevelFilter()`, `getCategoryFilter()`  |
| `logging.formatters` | Formatters: `spanFormatter`, `jsonFormatter`, etc.  |
| `logging.tracer`     | OpenTelemetry: `withSpan()`                         |
| `logging.category`   | Category utilities                                  |
| `logging.types`      | Type definitions                                    |

### Configuration (`logging.config`)

#### `configure(options: ConfigureOptions): Promise<void>`

Configures the logging system with sinks, filters, and loggers.

```typescript
type ConfigureOptions = {
  sinks: Record<string, Sink>;
  filters?: Record<string, Filter>;
  loggers: LoggerConfig[];
  contextLocalStorage?: ContextLocalStorage;
  reset?: boolean;
};
```

#### `reset(): Promise<void>`

Resets the logging configuration.

### Logger (`logging.logger`)

#### `getLogger(category: Category | string): Logger`

Gets or creates a logger for the given category.

### Logger Class

#### Properties

- `category: Category` - Hierarchical category array
- `parent: Logger | null` - Parent logger reference
- `loggerName: string` - Category as dot-separated string

#### Methods

- `log(severity, message, ...args)` - Log at specified severity
- `trace(message, ...args)` - Log trace message (most verbose)
- `debug(message, ...args)` - Log debug message
- `info(message, ...args)` - Log info message
- `notice(message, ...args)` - Log notice message
- `warn(message, ...args)` - Log warning message
- `error(message, ...args)` - Log error message
- `critical(message, ...args)` - Log critical message
- `alert(message, ...args)` - Log alert message
- `emergency(message, ...args)` - Log emergency message
- `getChild(subcategory)` - Create child logger
- `with(properties)` - Create logger with preset properties

### Context (`logging.context`)

#### `withContext<T>(context: Record<string, unknown>, fn: () => T): T`

Runs a function with additional context properties.

#### `getContext(): Record<string, unknown>`

Gets the current logging context.

#### `withCategoryPrefix<T>(prefix: string | Category, fn: () => T): T`

Runs a function with a category prefix applied to all loggers.

### Sinks (`logging.sinks`)

#### `getOutputSink(output, options?): Sink`

Creates a sink that writes log records to a `@eserstack/streams` Output. The
Output's renderer determines the final format (ANSI, Markdown, plain text).

```typescript
import * as streams from "@eserstack/streams";

const out = streams.output({
  renderer: streams.renderers.ansi(),
  sink: streams.sinks.stdout(),
});
const sink = logging.sinks.getOutputSink(out);

// Optionally pass a custom span formatter
const sink2 = logging.sinks.getOutputSink(out, { formatter: mySpanFormatter });
```

#### `getRecordCollectorSink(): { sink: Sink; records: LogRecord[] }`

Creates a sink that collects records into an array (for testing).

#### `getTestSink(): { sink: Sink; records: LogRecord[] }` _(deprecated)_

Alias for `getRecordCollectorSink()`. Use `getRecordCollectorSink()` instead.

#### `getBufferedSink(sink, options?): Sink`

Creates a sink that buffers records and flushes in batches.

#### `fingersCrossedSink(sink, options?): Sink`

Creates a sink that buffers low-severity logs and flushes them all when a
high-severity log (e.g. Error) occurs.

#### `withFilter(sink, filter): Sink`

Wraps a sink with a filter. Only records passing the filter reach the sink.

### Filters (`logging.filters`)

#### `getLevelFilter(level: Severity): Filter`

Creates a severity level filter.

#### `getCategoryFilter(category): Filter`

Creates a category filter.

#### `combineFilters(...filters): Filter`

Combines filters with AND logic.

### Formatters (`logging.formatters`)

#### `spanFormatter: SpanFormatterFn`

Default span-based formatter. Returns `Span[]` that adapts to any
`@eserstack/streams` renderer (ANSI colors, Markdown, plain text). Used
automatically by `getOutputSink()`.

#### `jsonFormatter: FormatterFn`

JSON formatter — outputs structured JSON log lines.

#### `textFormatter(options?): FormatterFn`

Human-readable text formatter with configurable timestamp format, category
separator, and level display.

#### `jsonLinesFormatter: FormatterFn`

Compact JSON Lines formatter (one JSON object per line).

#### `SpanFormatterFn` _(type)_

Type for formatter functions that produce `Span[]` instead of strings.

### Tracer (`logging.tracer`)

#### `withSpan<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T>`

Wraps an async function with automatic span and context correlation.

#### `tracer: Tracer`

Default OpenTelemetry tracer instance.

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).

# @eser/logging

`@eser/logging` is a hierarchical, category-based logging library with context
propagation, multiple sinks, filters, and OpenTelemetry integration. Inspired by
logtape, it provides a flexible and powerful logging solution for modern
TypeScript/JavaScript applications.

## Features

- **Hierarchical Categories** - Organize loggers in a tree structure like
  `["app", "http", "request"]`
- **Context Propagation** - Automatically include request IDs, trace IDs, and
  other context in logs
- **Multiple Sinks** - Route logs to console, streams, files, or custom
  destinations
- **Filters** - Filter logs by severity, category, properties, or custom logic
- **OpenTelemetry Integration** - Automatic correlation with distributed traces
- **RFC 5424 Severity Levels** - 8 standard severity levels (Emergency to Debug)
- **Lazy Evaluation** - Expensive log messages only computed when needed
- **Namespace Exports** - Clean API with `logging.config`, `logging.sinks`, etc.
- **TypeScript First** - Full type safety with proper type definitions

## Quick Start

```typescript
import * as logging from "@eser/logging";

// Configure once at app startup
await logging.config.configure({
  sinks: {
    console: logging.sinks.getConsoleSink({
      formatter: logging.formatters.ansiColorFormatter(),
    }),
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

## Severity Levels (RFC 5424)

| Level     | Value | Description                      |
| --------- | ----- | -------------------------------- |
| Emergency | 0     | System is unusable               |
| Alert     | 1     | Action must be taken immediately |
| Critical  | 2     | Critical conditions              |
| Error     | 3     | Error conditions                 |
| Warning   | 4     | Warning conditions               |
| Notice    | 5     | Normal but significant condition |
| Info      | 6     | Informational messages           |
| Debug     | 7     | Debug-level messages             |

## Usage Examples

### Hierarchical Categories

```typescript
import * as logging from "@eser/logging";

await logging.config.configure({
  sinks: { console: logging.sinks.getConsoleSink() },
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
import * as logging from "@eser/logging";

await logging.config.configure({
  sinks: { console: logging.sinks.getConsoleSink() },
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
import * as logging from "@eser/logging";

const logger = logging.logger.getLogger(["app"]);

// Create a logger with preset properties
const userLogger = logger.with({ userId: 123, role: "admin" });

await userLogger.info("User action"); // Includes userId and role
await userLogger.warn("Permission denied");
```

### Multiple Sinks

```typescript
import * as logging from "@eser/logging";

await logging.config.configure({
  sinks: {
    console: logging.sinks.getConsoleSink({
      formatter: logging.formatters.ansiColorFormatter(),
    }),
    file: logging.sinks.getStreamSink(fileStream, {
      formatter: logging.formatters.jsonFormatter,
    }),
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
import * as logging from "@eser/logging";

await logging.config.configure({
  sinks: { console: logging.sinks.getConsoleSink() },
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
import * as logging from "@eser/logging";

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
import * as logging from "@eser/logging";

const logger = logging.logger.getLogger(["app"]);

// Function only called if debug level is enabled
await logger.debug(() => {
  const expensiveData = computeExpensiveDebugInfo();
  return `Debug data: ${JSON.stringify(expensiveData)}`;
});
```

### Custom Formatters

```typescript
import * as logging from "@eser/logging";

// Built-in text formatter with options
await logging.config.configure({
  sinks: {
    console: logging.sinks.getConsoleSink({
      formatter: logging.formatters.textFormatter({
        timestamp: "time",
        categorySeparator: ".",
        includeLevel: true,
      }),
    }),
  },
  loggers: [{ category: ["app"], sinks: ["console"] }],
});

// Custom formatter
const customFormatter = (record: logging.LogRecord) => {
  return `[${record.datetime.toISOString()}] ${
    record.category.join(".")
  } - ${record.message}\n`;
};
```

## API Reference

### Namespaces

The library exports these namespaces:

| Namespace            | Description                                        |
| -------------------- | -------------------------------------------------- |
| `logging.config`     | Configuration: `configure()`, `reset()`            |
| `logging.logger`     | Logger: `getLogger()`, `Logger` class              |
| `logging.context`    | Context: `withContext()`, `getContext()`           |
| `logging.sinks`      | Sinks: `getConsoleSink()`, `getStreamSink()`       |
| `logging.filters`    | Filters: `getLevelFilter()`, `getCategoryFilter()` |
| `logging.formatters` | Formatters: `jsonFormatter`, `textFormatter()`     |
| `logging.tracer`     | OpenTelemetry: `withSpan()`                        |
| `logging.category`   | Category utilities                                 |
| `logging.types`      | Type definitions                                   |

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

#### `getConsoleSink(options?): Sink`

Creates a console sink.

#### `getStreamSink(stream, options?): Sink`

Creates a WritableStream sink.

#### `getTestSink(): { sink: Sink; records: LogRecord[] }`

Creates a test sink that captures records.

#### `fingersCrossedSink(sink, options?): Sink`

Creates a sink that buffers logs and flushes on error.

### Filters (`logging.filters`)

#### `getLevelFilter(level: Severity): Filter`

Creates a severity level filter.

#### `getCategoryFilter(category): Filter`

Creates a category filter.

#### `combineFilters(...filters): Filter`

Combines filters with AND logic.

### Formatters (`logging.formatters`)

#### `jsonFormatter: FormatterFn`

JSON formatter (default).

#### `textFormatter(options?): FormatterFn`

Human-readable text formatter.

#### `ansiColorFormatter(options?): FormatterFn`

Colored terminal formatter.

#### `jsonLinesFormatter: FormatterFn`

Compact JSON lines formatter.

### Tracer (`logging.tracer`)

#### `withSpan<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T>`

Wraps an async function with automatic span and context correlation.

#### `tracer: Tracer`

Default OpenTelemetry tracer instance.

---

For further details such as requirements, licensing and support guide, please
visit the [main eserstack repository](https://github.com/eser/stack).

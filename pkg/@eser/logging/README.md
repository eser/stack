# ⚙️ [@eser/logging](./)

`@eser/logging` is a powerful and flexible structured logging library that
provides asynchronous logging capabilities with configurable severity levels,
custom formatters, and stream-based output. Built with performance and
extensibility in mind, it offers a clean API for modern applications.

## 🚀 Getting Started with Structured Logging

Structured logging is a logging practice that uses a consistent, predefined
format to record events in your application. Unlike traditional plain-text logs,
structured logs are machine-readable and provide context-rich information.

### Benefits of Structured Logging

- **Queryable**: Easy to search, filter, and analyze
- **Consistent**: Uniform format across all log entries
- **Context-Rich**: Include additional metadata with each log entry
- **Machine-Readable**: Perfect for log aggregation and monitoring tools

### Logging Severity Levels

`@eser/logging` implements a comprehensive severity system:

- **Debug (7)**: Detailed information for debugging
- **Info (6)**: General informational messages
- **Warning (4)**: Warning messages for potentially harmful situations
- **Error (3)**: Error events that might still allow the application to continue
- **Critical (2)**: Critical conditions that require immediate attention

## 🤔 What @eser/logging offers?

`@eser/logging` provides a complete logging solution for modern applications:

- **Asynchronous Logging**: Non-blocking logging operations using WritableStream
- **Severity Levels**: Comprehensive severity level system with filtering
- **Custom Formatters**: Pluggable formatter system (JSON built-in, custom
  formatters supported)
- **Stream-Based Output**: Direct integration with any WritableStream
- **Type Safety**: Full TypeScript support with proper type definitions
- **Performance**: Lazy evaluation of log messages using function callbacks
- **Error Handling**: Proper stack trace logging and error serialization
- **Flexible Configuration**: Customizable logger instances with different
  configurations

The library follows modern logging best practices and integrates seamlessly with
cloud-native and microservices architectures.

## 🛠 Usage

Here you'll find examples of how to use `@eser/logging` for different logging
scenarios.

### Basic Usage

**Using the default logger:**

```js
import { current } from "@eser/logging";

// Basic logging
await current.info("Application started");
await current.debug("Debug information");
await current.warn("This is a warning");
await current.error("An error occurred");
await current.critical("Critical system failure");
```

**Logging with additional context:**

```js
import { current } from "@eser/logging";

await current.info("User logged in", {
  userId: "12345",
  email: "user@example.com",
  timestamp: new Date().toISOString(),
});

await current.error("Database connection failed", {
  host: "localhost",
  port: 5432,
  database: "myapp",
  error: "Connection timeout",
});
```

### Creating Custom Logger Instances

**Create a logger with custom configuration:**

```js
import { createLoggerState, Logger } from "@eser/logging";
import * as logging from "@eser/standards/logging";

// Create a custom writable stream (file, network, etc.)
const logStream = new WritableStream({
  write(chunk) {
    // Write to file, send to remote service, etc.
    console.log(new TextDecoder().decode(chunk));
  },
});

// Create logger state
const loggerState = createLoggerState(
  "my-app-logger", // Logger name
  logStream, // Target stream
  logging.Severities.Debug, // Log level
  // Custom formatter (optional)
);

// Create logger instance
const logger = new Logger(loggerState);

await logger.info("Custom logger message");
```

### Custom Formatters

**Create a custom formatter:**

```js
import { Logger, createLoggerState } from "@eser/logging";
import type { LogRecord, FormatterFn } from "@eser/logging";

// Custom plain text formatter
const textFormatter: FormatterFn = (record: LogRecord): string => {
  const timestamp = record.datetime.toISOString();
  const level = record.severity.toString().padStart(3);
  const logger = record.loggerName.padEnd(15);

  return `[${timestamp}] ${level} ${logger} | ${record.message}\n`;
};

// Create logger with custom formatter
const loggerState = createLoggerState(
  "text-logger",
  process.stdout,
  logging.Severities.Info,
  textFormatter
);

const logger = new Logger(loggerState);
await logger.info("This will be formatted as plain text");
// Output: [2023-12-07T10:30:45.123Z]   6 text-logger     | This will be formatted as plain text
```

**Custom JSON formatter with additional fields:**

```js
const customJsonFormatter: FormatterFn = (record: LogRecord): string => {
  return JSON.stringify({
    timestamp: record.datetime.toISOString(),
    level: logging.SeverityNames[record.severity],
    logger: record.loggerName,
    message: record.message,
    args: record.args,
    hostname: Deno.hostname(),
    pid: Deno.pid,
    version: "1.0.0"
  }) + "\n";
};
```

### Lazy Evaluation

**Use function callbacks for expensive operations:**

```js
import { current } from "@eser/logging";

// This function will only be called if debug level is enabled
await current.debug(() => {
  const expensiveData = computeExpensiveDebugInfo();
  return `Debug data: ${JSON.stringify(expensiveData)}`;
});

// Function with return value
const result = await current.info(() => {
  const data = { user: "john", action: "login" };
  return `User action: ${data.action}`;
});
console.log(result); // "User action: login"
```

### Error Logging

**Logging errors with stack traces:**

```js
import { current } from "@eser/logging";

try {
  throw new Error("Something went wrong");
} catch (error) {
  // The logger automatically extracts stack traces from Error objects
  await current.error("Operation failed", error);
}

// Custom error context
await current.error("API request failed", {
  url: "/api/users",
  method: "POST",
  statusCode: 500,
  error: new Error("Internal server error"),
});
```

### Stream Integration

**Log to multiple destinations:**

```js
import { createLoggerState, Logger } from "@eser/logging";

// Create a tee stream that writes to multiple destinations
class TeeStream extends WritableStream {
  constructor(...streams) {
    super({
      async write(chunk) {
        await Promise.all(
          streams.map((stream) => stream.getWriter().write(chunk)),
        );
      },
    });
  }
}

// Log to both console and file
const multiStream = new TeeStream(
  new WritableStream({
    write: (chunk) => console.log(new TextDecoder().decode(chunk)),
  }),
  // File stream would go here
);

const logger = new Logger(createLoggerState("multi-logger", multiStream));
await logger.info("This goes to multiple destinations");
```

### Filtering by Log Level

**Configure different log levels:**

```js
import { createLoggerState, Logger } from "@eser/logging";
import * as logging from "@eser/standards/logging";

// Production logger - only warnings and above
const prodLogger = new Logger(createLoggerState(
  "prod",
  process.stdout,
  logging.Severities.Warning,
));

// Development logger - all levels
const devLogger = new Logger(createLoggerState(
  "dev",
  process.stdout,
  logging.Severities.Debug,
));

// These will be filtered out in production
await prodLogger.debug("Debug info"); // Not logged
await prodLogger.info("Info message"); // Not logged
await prodLogger.warn("Warning"); // Logged
await prodLogger.error("Error"); // Logged
```

## 📕 API Reference

### Logger Class

**constructor(state: LoggerState)** Creates a new logger instance with the
specified state.

**async log&lt;T&gt;(severity: Severity, message: T | (() =&gt; T), ...args):
Promise&lt;T | undefined&gt;** Core logging method. Supports both direct values
and lazy evaluation functions.

**async debug&lt;T&gt;(message: T | (() =&gt; T), ...args): Promise&lt;T |
undefined&gt;** Logs debug-level messages.

**async info&lt;T&gt;(message: T | (() =&gt; T), ...args): Promise&lt;T |
undefined&gt;** Logs informational messages.

**async warn&lt;T&gt;(message: T | (() =&gt; T), ...args): Promise&lt;T |
undefined&gt;** Logs warning messages.

**async error&lt;T&gt;(message: T | (() =&gt; T), ...args): Promise&lt;T |
undefined&gt;** Logs error messages.

**async critical&lt;T&gt;(message: T | (() =&gt; T), ...args): Promise&lt;T |
undefined&gt;** Logs critical messages.

**asString(data: unknown, isProperty?: boolean): string** Converts data to
string representation for logging.

### Factory Functions

**createLoggerState(loggerName: string, targetStream: WritableStream, loglevel?:
Severity, formatter?: FormatterFn): LoggerState** Creates a new logger state
configuration.

### Built-in Formatters

**jsonFormatter(logRecord: LogRecord): string** Default JSON formatter that
outputs structured log data.

### Types

**LogRecord** Interface representing a single log record with message, severity,
timestamp, and arguments.

**LoggerState** Configuration object for logger instances including name,
stream, level, and formatter.

**FormatterFn** Function signature for custom log formatters.

### Default Instance

**current: Logger** Default logger instance configured to write to stdout with
INFO level and JSON formatting.

---

🔗 For further details such as requirements, licensing and support guide, please
visit the [main eserstack repository](https://github.com/eser/stack).

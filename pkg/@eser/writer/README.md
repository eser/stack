# 📝 [@eser/writer](./)

`@eser/writer` is a powerful and extensible data serialization library that
provides a unified interface for writing data in multiple formats. It offers a
pluggable architecture with built-in support for JSON, YAML, CSV, and TOML
formats, while allowing custom format implementations.

## 🚀 Getting Started with Data Serialization

Data serialization is the process of converting data structures or objects into
a format that can be stored or transmitted and reconstructed later. Different
applications require different serialization formats:

### Common Serialization Formats

- **JSON**: Lightweight, human-readable, widely supported
- **YAML**: Human-readable, great for configuration files
- **CSV**: Tabular data, spreadsheet compatibility
- **TOML**: Configuration files, simple and intuitive

### The Unified Approach

`@eser/writer` eliminates the need to learn different APIs for each format.
Instead of using separate libraries and APIs for JSON, YAML, CSV, and TOML, you
get a single, consistent interface.

## 🤔 What @eser/writer offers?

`@eser/writer` provides a comprehensive solution for data serialization needs:

- **Multi-Format Support**: Built-in support for JSON, YAML, CSV, and TOML
  formats
- **Unified API**: Single function interface for all formats
- **Pluggable Architecture**: Easy registration of custom formats
- **Format Registry**: Automatic format detection by name or file extension
- **Rich Options**: Pretty printing, indentation, custom delimiters, and more
- **Error Handling**: Comprehensive error types for debugging
- **Type Safety**: Full TypeScript support with proper type definitions
- **Zero Configuration**: Works out of the box with sensible defaults

The library automatically registers all built-in formats and provides both
programmatic and filename-based format detection.

## 🛠 Usage

Here you'll find examples of how to use `@eser/writer` for different data
serialization scenarios.

### Writer Factory (Streaming Pattern)

The `writer()` factory creates a writer instance that accumulates data and
supports multiple output methods including Web Streams API:

```js
import { writer } from "@eser/writer";

// Create a writer for JSON format
const logger = writer({ type: "json", name: "app-logger" });

// Accumulate data
logger.write({ event: "startup", timestamp: Date.now() });
logger.write({ event: "ready", timestamp: Date.now() });

// Output options:
const output = logger.string(); // Get as string
const bytes = logger.bytes(); // Get as Uint8Array
await logger.pipeToStdout(); // Pipe to stdout

// Stream to any WritableStream
const file = await Deno.open("output.json", { write: true, create: true });
await logger.pipeTo(file.writable);

// Get as ReadableStream for further processing
const stream = logger.readable();

// Clear buffer for reuse
logger.clear();
```

**Forward-only streaming:** The writer uses a streaming architecture that
serializes each item immediately on `write()`, without buffering raw objects.
This provides:

- Constant memory usage regardless of item count
- Immediate serialization (no batch processing)
- Streaming-ready output

**Structured streaming:** For explicit document boundaries, use `start()` and
`end()`:

```js
const w = writer({ type: "json" });
w.start(); // outputs: [
w.write({ a: 1 }); // outputs: {"a":1}
w.write({ b: 2 }); // outputs: ,{"b":2}
w.end(); // outputs: ]
// Result: [{"a":1},{"b":2}]
```

**Multi-document output:** When using only `write()` without `start()`/`end()`,
each format uses its standard multi-document convention:

- **JSON**: JSONL (one object per line): `{"a":1}\n{"b":2}\n`
- **JSONL**: Explicit JSONL format (one object per line)
- **YAML**: Documents separated by `---`
- **CSV**: Appends rows (single header, detected from first item)
- **TOML**: Documents separated by `+++`

### One-Shot Serialization

For simple, one-off serialization, use the `serialize()` function:

**Serialize JSON data:**

```js
import { serialize } from "@eser/writer";

const data = { name: "John", age: 30, active: true };
const jsonString = serialize(data, "json");
console.log(jsonString);
// Output: {"name":"John","age":30,"active":true}
```

**Pretty-formatted JSON:**

```js
import { serialize } from "@eser/writer";

const data = { name: "John", age: 30, city: "New York" };
const prettyJson = serialize(data, "json", { pretty: true, indent: 2 });
console.log(prettyJson);
/* Output:
{
  "name": "John",
  "age": 30,
  "city": "New York"
}
*/
```

**YAML data:**

```js
import { serialize } from "@eser/writer";

const config = {
  database: {
    host: "localhost",
    port: 5432,
    name: "myapp",
  },
  features: ["auth", "logging", "metrics"],
};

const yamlString = serialize(config, "yaml");
console.log(yamlString);
/* Output:
database:
  host: localhost
  port: 5432
  name: myapp
features:
  - auth
  - logging
  - metrics
*/
```

**CSV data:**

```js
import { serialize } from "@eser/writer";

const users = [
  { name: "Alice", email: "alice@example.com", age: 25 },
  { name: "Bob", email: "bob@example.com", age: 30 },
  { name: "Charlie", email: "charlie@example.com", age: 35 },
];

const csvString = serialize(users, "csv");
console.log(csvString);
/* Output:
name,email,age
Alice,alice@example.com,25
Bob,bob@example.com,30
Charlie,charlie@example.com,35
*/
```

**TOML configuration:**

```js
import { serialize } from "@eser/writer";

const config = {
  title: "My Application",
  database: {
    server: "192.168.1.1",
    ports: [8001, 8001, 8002],
    connection_max: 5000,
    enabled: true,
  },
};

const tomlString = serialize(config, "toml");
console.log(tomlString);
/* Output:
title = "My Application"

[database]
server = "192.168.1.1"
ports = [8001, 8001, 8002]
connection_max = 5000
enabled = true
*/
```

### Format Detection by File Extension

```js
import { serialize } from "@eser/writer";

const data = { message: "Hello World" };

// These are equivalent:
serialize(data, "json");
serialize(data, ".json");

// Detect format from filename
serialize(data, "config.yaml"); // Uses YAML format
serialize(data, "data.csv"); // Uses CSV format
```

### Custom Format Registration

**Create a custom XML format:**

```js
import { registerFormat, serialize } from "@eser/writer";

const xmlFormat = {
  name: "xml",
  extensions: [".xml"],
  writeItem: (data, options) => {
    // Simple XML serialization (you'd want a more robust implementation)
    const toXML = (obj, indent = 0) => {
      const spaces = " ".repeat(indent);
      let xml = "";

      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === "object" && value !== null) {
          xml += `${spaces}<${key}>\n${
            toXML(value, indent + 2)
          }\n${spaces}</${key}>\n`;
        } else {
          xml += `${spaces}<${key}>${value}</${key}>\n`;
        }
      }

      return xml;
    };

    return `<?xml version="1.0" encoding="UTF-8"?>\n<root>\n${
      toXML(data, 2)
    }</root>`;
  },
};

// Register the custom format
registerFormat(xmlFormat);

// Now you can use it
const data = { user: { name: "John", age: 30 } };
const xmlString = serialize(data, "xml");
console.log(xmlString);
```

### Working with Format Registry

```js
import { getFormat, hasFormat, listFormats } from "@eser/writer";

// List all available formats
console.log(listFormats());
// Output: [{ name: "json", extensions: [".json"], ... }, ...]

// Check if format exists
console.log(hasFormat("yaml")); // true
console.log(hasFormat(".csv")); // true
console.log(hasFormat("pdf")); // false

// Get format details
const jsonFormat = getFormat("json");
if (jsonFormat) {
  console.log(`Format: ${jsonFormat.name}`);
  console.log(`Extensions: ${jsonFormat.extensions.join(", ")}`);
}
```

### Error Handling

```js
import {
  FormatNotFoundError,
  SerializationError,
  serialize,
} from "@eser/writer";

try {
  const data = { circular: {} };
  data.circular.ref = data; // Create circular reference

  const result = serialize(data, "json");
} catch (error) {
  if (error instanceof FormatNotFoundError) {
    console.error(`Format not found: ${error.format}`);
  } else if (error instanceof SerializationError) {
    console.error(`Serialization failed: ${error.message}`);
    console.error(`Format: ${error.format}`);
  }
}
```

## 📕 API Reference

### Writer Factory

**writer(options: WriterOptions): WriterInstance** Creates a writer instance
that accumulates data. Options:

- `type`: Format name (e.g., "json", "yaml")
- `name`: Optional name for the writer instance
- `options`: Format-specific options

**WriterInstance** methods:

- `start(): void` - Begin document structure (e.g., `[` for JSON arrays)
- `write(data: unknown): void` - Accumulate data
- `end(): void` - End document structure (e.g., `]` for JSON arrays)
- `clear(): void` - Reset the buffer
- `string(): string` - Get accumulated output as string
- `bytes(): Uint8Array` - Get output as bytes (via TextEncoder)
- `readable(): ReadableStream<string>` - Get as ReadableStream
- `pipeTo(dest: WritableStream<string>): Promise<void>` - Pipe to WritableStream
- `pipeToStdout(): Promise<void>` - Pipe to stdout
- `name?: string` - Optional writer name

### Core Functions

**serialize(data: unknown, format: string, options?: WriteOptions): string**
Serializes data using the specified format. The format can be a format name
(e.g., "json") or file extension (e.g., ".json").

### Format Registry Functions

**registerFormat(format: WriterFormat): void** Registers a new format in the
global format registry.

**unregisterFormat(name: string): void** Removes a format from the registry by
name.

**getFormat(nameOrExtension: string): WriterFormat | undefined** Retrieves a
format by name or extension.

**listFormats(): WriterFormat[]** Returns an array of all registered formats.

**hasFormat(nameOrExtension: string): boolean** Checks if a format is
registered.

**createRegistry(): FormatRegistry** Creates a new, isolated format registry
instance.

### Built-in Formats

**JSON**

- Extensions: `.json`
- Options: `pretty`, `indent`
- Multi-document: JSONL format (one JSON object per line)

**YAML**

- Extensions: `.yaml`, `.yml`
- Options: `pretty`, `indent`, `separator`
- Multi-document: Uses `---` separator between documents

**CSV**

- Extensions: `.csv`
- Options: `delimiter`, `quote`, `headers`
- Multi-document: Appends rows (single header, multiple data rows)

**TOML**

- Extensions: `.toml`
- Options: `pretty`, `separator`
- Multi-document: Uses `+++` separator between documents

### Types

**WriterOptions** Options for creating a writer instance with `type`, `name`,
and format `options`.

**WriterInstance** The writer instance with `write`, `pipe`, `string`, `clear`
methods.

**WriterFormat** Interface for format implementations with `name`, `extensions`,
`writeStart`, `writeItem`, and `writeEnd` functions for structured streaming.

**WriteOptions** Configuration options including format-specific options like
`pretty`, `indent`, `delimiter`, etc.

**FormatRegistry** Interface for format registry operations.

### Error Classes

**WriterError** Base error class for all writer-related errors.

**FormatNotFoundError** Thrown when a requested format is not found in the
registry.

**SerializationError** Thrown when data serialization fails.

---

🔗 For further details such as requirements, licensing and support guide, please
visit the [main eserstack repository](https://github.com/eser/stack).

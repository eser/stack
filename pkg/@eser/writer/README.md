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

### Basic Usage

**Write JSON data:**

```js
import * as writer from "@eser/writer";

const data = { name: "John", age: 30, active: true };
const jsonString = writer.write(data, "json");
console.log(jsonString);
// Output: {"name":"John","age":30,"active":true}
```

**Write pretty-formatted JSON:**

```js
import * as writer from "@eser/writer";

const data = { name: "John", age: 30, city: "New York" };
const prettyJson = writer.write(data, "json", { pretty: true, indent: 2 });
console.log(prettyJson);
/* Output:
{
  "name": "John",
  "age": 30,
  "city": "New York"
}
*/
```

**Write YAML data:**

```js
import * as writer from "@eser/writer";

const config = {
  database: {
    host: "localhost",
    port: 5432,
    name: "myapp",
  },
  features: ["auth", "logging", "metrics"],
};

const yamlString = writer.write(config, "yaml");
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

**Write CSV data:**

```js
import * as writer from "@eser/writer";

const users = [
  { name: "Alice", email: "alice@example.com", age: 25 },
  { name: "Bob", email: "bob@example.com", age: 30 },
  { name: "Charlie", email: "charlie@example.com", age: 35 },
];

const csvString = writer.write(users, "csv");
console.log(csvString);
/* Output:
name,email,age
Alice,alice@example.com,25
Bob,bob@example.com,30
Charlie,charlie@example.com,35
*/
```

**Write TOML configuration:**

```js
import * as writer from "@eser/writer";

const config = {
  title: "My Application",
  database: {
    server: "192.168.1.1",
    ports: [8001, 8001, 8002],
    connection_max: 5000,
    enabled: true,
  },
};

const tomlString = writer.write(config, "toml");
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
import * as writer from "@eser/writer";

const data = { message: "Hello World" };

// These are equivalent:
writer.write(data, "json");
writer.write(data, ".json");

// Detect format from filename
writer.write(data, "config.yaml"); // Uses YAML format
writer.write(data, "data.csv"); // Uses CSV format
```

### Custom Format Registration

**Create a custom XML format:**

```js
import * as writer from "@eser/writer";

const xmlFormat = {
  name: "xml",
  extensions: [".xml"],
  serialize: (data, options) => {
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
writer.registerFormat(xmlFormat);

// Now you can use it
const data = { user: { name: "John", age: 30 } };
const xmlString = write(data, "xml");
console.log(xmlString);
```

### Working with Format Registry

```js
import * as writer from "@eser/writer";

// List all available formats
console.log(writer.listFormats());
// Output: [{ name: "json", extensions: [".json"], ... }, ...]

// Check if format exists
console.log(writer.hasFormat("yaml")); // true
console.log(writer.hasFormat(".csv")); // true
console.log(writer.hasFormat("pdf")); // false

// Get format details
const jsonFormat = writer.getFormat("json");
if (jsonFormat) {
  console.log(`Format: ${jsonFormat.name}`);
  console.log(`Extensions: ${jsonFormat.extensions.join(", ")}`);
}
```

### Error Handling

```js
import * as writer from "@eser/writer";

try {
  const data = { circular: {} };
  data.circular.ref = data; // Create circular reference

  const result = writer.write(data, "json");
} catch (error) {
  if (error instanceof writer.FormatNotFoundError) {
    console.error(`Format not found: ${error.format}`);
  } else if (error instanceof writer.SerializationError) {
    console.error(`Serialization failed: ${error.message}`);
    console.error(`Format: ${error.format}`);
  }
}
```

## 📕 API Reference

### Core Functions

**write(data: unknown, format: string, options?: WriteOptions): string**
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

**YAML**

- Extensions: `.yaml`, `.yml`
- Options: `pretty`, `indent`

**CSV**

- Extensions: `.csv`
- Options: `delimiter`, `quote`, `headers`

**TOML**

- Extensions: `.toml`
- Options: `pretty`

### Types

**WriterFormat** Interface for format implementations with `name`, `extensions`,
and `serialize` function.

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

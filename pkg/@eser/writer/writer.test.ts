// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { serialize } from "./serializer.ts";
import { writer } from "./writer.ts";
import {
  createRegistry,
  hasFormat,
  listFormats,
  registerFormat,
  unregisterFormat,
} from "./format-registry.ts";
import {
  DeserializationError,
  FormatNotFoundError,
  SerializationError,
  WriterError,
  type WriterFormat,
} from "./types.ts";

// Register built-in formats for testing
import { jsonFormat } from "./formats/json.ts";
import { yamlFormat } from "./formats/yaml.ts";
import { csvFormat } from "./formats/csv.ts";
import { tomlFormat } from "./formats/toml.ts";

registerFormat(jsonFormat);
registerFormat(yamlFormat);
registerFormat(csvFormat);
registerFormat(tomlFormat);

const testData = {
  name: "test-app",
  version: "1.0.0",
  config: {
    replicas: 3,
    ports: [80, 443],
  },
};

const testArray = [
  { name: "app1", version: "1.0.0" },
  { name: "app2", version: "2.0.0" },
];

Deno.test("serialize() should serialize JSON format", () => {
  const result = serialize(testData, "json");
  const parsed = JSON.parse(result);
  // serialize() wraps single items in an array
  assert.assertEquals(parsed[0].name, "test-app");
  assert.assertEquals(parsed[0].config.replicas, 3);
});

Deno.test("serialize() should serialize JSON with pretty formatting", () => {
  const result = serialize(testData, "json", { pretty: true });
  assert.assertStringIncludes(result, "\n");
  assert.assertStringIncludes(result, "  ");
});

Deno.test("serialize() should serialize YAML format", () => {
  const result = serialize(testData, "yaml");
  assert.assertStringIncludes(result, "name: test-app");
  assert.assertStringIncludes(result, "version: 1.0.0");
  assert.assertStringIncludes(result, "replicas: 3");
});

Deno.test("serialize() should serialize YAML array with separator", () => {
  const result = serialize(testArray, "yaml", { separator: "---" });
  assert.assertStringIncludes(result, "name: app1");
  assert.assertStringIncludes(result, "---");
  assert.assertStringIncludes(result, "name: app2");
});

Deno.test("serialize() should serialize CSV format", () => {
  const csvData = [
    { name: "app1", version: "1.0.0", replicas: 3 },
    { name: "app2", version: "2.0.0", replicas: 2 },
  ];

  const result = serialize(csvData, "csv");
  assert.assertStringIncludes(result, "name,version,replicas");
  assert.assertStringIncludes(result, "app1,1.0.0,3");
  assert.assertStringIncludes(result, "app2,2.0.0,2");
});

Deno.test("serialize() should serialize TOML format", () => {
  const result = serialize(testData, "toml");
  assert.assertStringIncludes(result, '"test-app"');
  assert.assertStringIncludes(result, '"1.0.0"');
  assert.assertStringIncludes(result, "[config]");
  assert.assertStringIncludes(result, "replicas = 3");
});

Deno.test("serialize() should throw FormatNotFoundError for unknown format", () => {
  assert.assertThrows(
    () => serialize(testData, "unknown"),
    FormatNotFoundError,
    "Format 'unknown' not found in registry",
  );
});

Deno.test("registerFormat() should allow custom formats", () => {
  const customFormat: WriterFormat = {
    name: "custom",
    extensions: [".custom"],
    writeItem: (data) => `CUSTOM: ${JSON.stringify(data)}`,
  };

  registerFormat(customFormat);

  const result = serialize(testData, "custom");
  assert.assertEquals(result, `CUSTOM: ${JSON.stringify(testData)}`);
});

Deno.test("serialize() should handle TOML validation errors", () => {
  // TOML requires each document to be an object when using array with separator
  assert.assertThrows(
    () => serialize(["string", "not", "allowed"], "toml", { separator: "+++" }),
    Error,
    "TOML format requires each document to be an object",
  );

  // Single non-object value should still throw
  assert.assertThrows(
    () => serialize("string value", "toml"),
    Error,
    "TOML format requires each document to be an object",
  );
});

Deno.test("serialize() should handle empty data gracefully", () => {
  // serialize() wraps single items in an array
  const jsonResult = serialize(null, "json");
  assert.assertEquals(jsonResult, "[null]\n");

  const yamlResult = serialize(null, "yaml");
  assert.assertStringIncludes(yamlResult, "null");

  const csvResult = serialize([], "csv");
  assert.assertEquals(csvResult, "");
});

Deno.test("serialize() should handle nested objects in CSV", () => {
  const complexData = [
    { name: "app1", config: { replicas: 3 } },
    { name: "app2", config: { replicas: 2 } },
  ];

  const result = serialize(complexData, "csv");
  // CSV will stringify nested objects
  assert.assertStringIncludes(result, "name,config");
});

// Format Registry Tests
Deno.test("unregisterFormat() should remove format by name", () => {
  const testFormat: WriterFormat = {
    name: "test-unregister",
    extensions: [".testun"],
    writeItem: (data) => JSON.stringify(data),
  };

  registerFormat(testFormat);
  assert.assertEquals(hasFormat("test-unregister"), true);

  unregisterFormat("test-unregister");
  assert.assertEquals(hasFormat("test-unregister"), false);
});

Deno.test("unregisterFormat() should handle non-existent format gracefully", () => {
  // Should not throw
  unregisterFormat("non-existent-format");
});

Deno.test("listFormats() should return unique formats", () => {
  const formats = listFormats();

  // Should have at least the built-in formats
  assert.assert(formats.length >= 4);

  // Should not have duplicates
  const names = formats.map((f) => f.name);
  const uniqueNames = [...new Set(names)];
  assert.assertEquals(names.length, uniqueNames.length);
});

Deno.test("hasFormat() should return true for registered format", () => {
  assert.assertEquals(hasFormat("json"), true);
  assert.assertEquals(hasFormat("yaml"), true);
});

Deno.test("hasFormat() should return false for unregistered format", () => {
  assert.assertEquals(hasFormat("nonexistent"), false);
});

Deno.test("hasFormat() should work with extension lookup", () => {
  assert.assertEquals(hasFormat(".json"), true);
  assert.assertEquals(hasFormat("json"), true);
  assert.assertEquals(hasFormat(".yaml"), true);
});

Deno.test("createRegistry() should create isolated registry", () => {
  const registry = createRegistry();

  // New registry should be empty
  assert.assertEquals(registry.list().length, 0);
  assert.assertEquals(registry.has("json"), false);

  // Register a format in isolated registry
  registry.register({
    name: "isolated-format",
    extensions: [".isolated"],
    writeItem: (data) => String(data),
  });

  // Should be in isolated registry
  assert.assertEquals(registry.has("isolated-format"), true);

  // Should not affect global registry
  assert.assertEquals(hasFormat("isolated-format"), false);
});

Deno.test("registerFormat() should throw for format without name", () => {
  assert.assertThrows(
    () =>
      registerFormat({
        name: "",
        extensions: [".test"],
        writeItem: (data) => String(data),
      }),
    Error,
    "Format must have a name",
  );
});

Deno.test("registerFormat() should throw for format without extensions", () => {
  assert.assertThrows(
    () =>
      registerFormat({
        name: "no-ext",
        extensions: [],
        writeItem: (data) => String(data),
      }),
    Error,
    "Format must define at least one extension",
  );
});

// JSON Format Tests
Deno.test("serialize() JSON with custom indent option", () => {
  const data = { name: "test" };
  const result = serialize(data, "json", { pretty: true, indent: 4 });
  assert.assertStringIncludes(result, "    "); // 4-space indent
});

Deno.test("serialize() JSON throws SerializationError for circular references", () => {
  const circular: Record<string, unknown> = { name: "test" };
  circular["self"] = circular; // Create circular reference

  assert.assertThrows(
    () => serialize(circular, "json"),
    Error,
    "Failed to serialize JSON",
  );
});

// CSV Format Tests
Deno.test("serialize() CSV with primitive array", () => {
  const primitiveArray = [1, 2, 3];
  const result = serialize(primitiveArray, "csv");
  // Primitives are serialized as {value: x} individually
  assert.assertStringIncludes(result, "value");
  assert.assertStringIncludes(result, "1");
  assert.assertStringIncludes(result, "2");
  assert.assertStringIncludes(result, "3");
});

Deno.test("serialize() CSV with single object", () => {
  const singleObj = { name: "app", version: "1.0" };
  const result = serialize(singleObj, "csv");
  assert.assertStringIncludes(result, "name,version");
  assert.assertStringIncludes(result, "app,1.0");
});

Deno.test("serialize() CSV with primitive value", () => {
  const primitive = "hello";
  const result = serialize(primitive, "csv");
  assert.assertStringIncludes(result, "value");
  assert.assertStringIncludes(result, "hello");
});

Deno.test("serialize() CSV with custom delimiter", () => {
  const data = [{ name: "app", version: "1.0" }];
  const result = serialize(data, "csv", { delimiter: ";" });
  assert.assertStringIncludes(result, "name;version");
  assert.assertStringIncludes(result, "app;1.0");
});

Deno.test("serialize() CSV with custom headers", () => {
  const data = [{ name: "app", version: "1.0", extra: "ignored" }];
  const result = serialize(data, "csv", { headers: ["name", "version"] });
  assert.assertStringIncludes(result, "name,version");
  assert.assertNotMatch(result, /extra/);
});

// Writer Factory Tests
Deno.test("writer() should create writer instance with name", () => {
  const w = writer({ type: "json", name: "test-logger" });
  assert.assertEquals(w.name, "test-logger");
});

Deno.test("writer() should accumulate data with write() as JSONL", () => {
  const w = writer({ type: "json" });
  w.write({ a: 1 });
  w.write({ b: 2 });

  const result = w.string();
  // JSONL format: one JSON object per line
  assert.assertEquals(result, '{"a":1}\n{"b":2}\n');
});

Deno.test("writer() should output single item without array wrapper", () => {
  const w = writer({ type: "json" });
  w.write({ name: "test" });

  const result = w.string();
  const parsed = JSON.parse(result);
  assert.assertEquals(parsed.name, "test");
});

Deno.test("writer() string() should return empty string for empty buffer", () => {
  const w = writer({ type: "json" });
  assert.assertEquals(w.string(), "");
});

Deno.test("writer() bytes() should return Uint8Array", () => {
  const w = writer({ type: "json" });
  w.write({ value: 42 });

  const bytes = w.bytes();
  assert.assertInstanceOf(bytes, Uint8Array);

  const decoded = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(decoded);
  assert.assertEquals(parsed.value, 42);
});

Deno.test("writer() readable() should return ReadableStream", async () => {
  const w = writer({ type: "json" });
  w.write({ value: 42 });

  const stream = w.readable();
  assert.assertInstanceOf(stream, ReadableStream);

  const reader = stream.getReader();
  const { value, done } = await reader.read();

  assert.assertEquals(done, false);
  const parsed = JSON.parse(value as string);
  assert.assertEquals(parsed.value, 42);

  reader.releaseLock();
});

Deno.test("writer() pipeTo() should pipe to WritableStream", async () => {
  const w = writer({ type: "json" });
  w.write({ value: 42 });

  let captured = "";
  const dest = new WritableStream<string>({
    write(chunk) {
      captured += chunk;
    },
  });

  await w.pipeTo(dest);

  const parsed = JSON.parse(captured);
  assert.assertEquals(parsed.value, 42);
});

Deno.test("writer() clear() should reset buffer", () => {
  const w = writer({ type: "json" });
  w.write({ a: 1 });
  w.write({ b: 2 });

  w.clear();

  assert.assertEquals(w.string(), "");
});

Deno.test("writer() should throw FormatNotFoundError for unknown format", () => {
  assert.assertThrows(
    () => writer({ type: "unknown-format" }),
    FormatNotFoundError,
    "Format 'unknown-format' not found in registry",
  );
});

Deno.test("writer() should pass format options", () => {
  const w = writer({ type: "json", options: { pretty: true } });
  w.write({ name: "test" });

  const result = w.string();
  assert.assertStringIncludes(result, "\n");
  assert.assertStringIncludes(result, "  ");
});

Deno.test("writer() should work with YAML format using --- separator", () => {
  const w = writer({ type: "yaml" });
  w.write({ name: "app1" });
  w.write({ name: "app2" });

  const result = w.string();
  assert.assertStringIncludes(result, "name: app1");
  assert.assertStringIncludes(result, "---");
  assert.assertStringIncludes(result, "name: app2");
});

Deno.test("writer() should work with TOML format using +++ separator", () => {
  const w = writer({ type: "toml" });
  w.write({ name: "app1" });
  w.write({ name: "app2" });

  const result = w.string();
  assert.assertStringIncludes(result, 'name = "app1"');
  assert.assertStringIncludes(result, "+++");
  assert.assertStringIncludes(result, 'name = "app2"');
});

Deno.test("serialize() should support TOML multi-doc with separator", () => {
  const data = [
    { name: "doc1", value: 1 },
    { name: "doc2", value: 2 },
  ];
  const result = serialize(data, "toml", { separator: "+++" });
  assert.assertStringIncludes(result, '"doc1"');
  assert.assertStringIncludes(result, "+++");
  assert.assertStringIncludes(result, '"doc2"');
});

// Additional CSV Format Tests for Coverage
Deno.test("writer() CSV with multiple items writes rows", () => {
  const w = writer({ type: "csv" });
  w.write({ id: 1, name: "app1" });
  w.write({ id: 2, name: "app2" });

  const result = w.string();
  // First write includes headers
  assert.assertStringIncludes(result, "id,name");
  assert.assertStringIncludes(result, "1,app1");
  assert.assertStringIncludes(result, "2,app2");
});

Deno.test("serialize() CSV with values containing commas", () => {
  const data = [{ name: "app, with comma", version: "1.0" }];
  const result = serialize(data, "csv");
  // CSV should quote values with commas
  assert.assertStringIncludes(result, '"app, with comma"');
});

// Additional YAML Format Tests for Coverage
Deno.test("serialize() YAML with empty separator option", () => {
  const result = serialize({ a: 1 }, "yaml", { separator: "" });
  // Should use default separator ---
  assert.assertStringIncludes(result, "a: 1");
});

Deno.test("serialize() YAML single item with custom separator", () => {
  const result = serialize({ a: 1 }, "yaml", { separator: "===" });
  assert.assertStringIncludes(result, "===");
});

Deno.test("serialize() YAML with nested object", () => {
  const data = {
    parent: {
      child: {
        value: "deep",
      },
    },
  };
  const result = serialize(data, "yaml");
  assert.assertStringIncludes(result, "parent:");
  assert.assertStringIncludes(result, "child:");
  assert.assertStringIncludes(result, "value: deep");
});

// Writer Instance Tests for Coverage
Deno.test("writer() start() is idempotent", () => {
  const w = writer({ type: "json" });
  w.start();
  w.write({ a: 1 });
  w.start(); // Call again - should be no-op
  w.write({ b: 2 });
  w.end();

  const result = w.string();
  // Should only have one opening bracket
  const openBrackets = (result.match(/\[/g) ?? []).length;
  assert.assertEquals(openBrackets, 1);
});

Deno.test("writer() end() is idempotent", () => {
  const w = writer({ type: "json" });
  w.start();
  w.write({ a: 1 });
  w.end();
  w.end(); // Call again - should be no-op

  const result = w.string();
  // Should only have one closing bracket
  const closeBrackets = (result.match(/\]/g) ?? []).length;
  assert.assertEquals(closeBrackets, 1);
});

Deno.test("writer() with custom format that has writeStart and writeEnd", () => {
  const customWithBoundaries: WriterFormat = {
    name: "custom-boundaries",
    extensions: [".cbs"],
    writeStart: () => "<<<START>>>\n",
    writeItem: (data) => JSON.stringify(data) + "\n",
    writeEnd: () => "<<<END>>>\n",
  };
  registerFormat(customWithBoundaries);

  const w = writer({ type: "custom-boundaries" });
  w.start();
  w.write({ a: 1 });
  w.write({ b: 2 });
  w.end();

  const result = w.string();
  assert.assertStringIncludes(result, "<<<START>>>");
  assert.assertStringIncludes(result, '{"a":1}');
  assert.assertStringIncludes(result, '{"b":2}');
  assert.assertStringIncludes(result, "<<<END>>>");
});

Deno.test("writer() clear() resets started and ended flags", () => {
  const w = writer({ type: "json" });
  w.start();
  w.write({ a: 1 });
  w.end();
  w.clear();

  // After clear, should be able to start fresh
  w.start();
  w.write({ b: 2 });
  w.end();

  const result = w.string();
  // Should have new content with proper structure
  assert.assertStringIncludes(result, '{"b":2}');
  assert.assertNotMatch(result, /{"a":1}/);
});

Deno.test("writer() JSON with start/end produces array", () => {
  const w = writer({ type: "json" });
  w.start();
  w.write({ a: 1 });
  w.write({ b: 2 });
  w.end();

  const result = w.string();
  const parsed = JSON.parse(result);
  assert.assertEquals(Array.isArray(parsed), true);
  assert.assertEquals(parsed.length, 2);
});

// Error Class Tests for Coverage
Deno.test("WriterError should have correct name and format", () => {
  const error = new WriterError("test message", "json");
  assert.assertEquals(error.name, "WriterError");
  assert.assertEquals(error.format, "json");
  assert.assertEquals(error.message, "test message");
});

Deno.test("WriterError without format should have undefined format", () => {
  const error = new WriterError("test message");
  assert.assertEquals(error.format, undefined);
});

Deno.test("FormatNotFoundError should have correct properties", () => {
  const error = new FormatNotFoundError("unknown");
  assert.assertEquals(error.name, "FormatNotFoundError");
  assert.assertEquals(error.format, "unknown");
  assert.assertStringIncludes(error.message, "unknown");
});

Deno.test("SerializationError should capture cause", () => {
  const cause = new Error("underlying error");
  const error = new SerializationError("serialize failed", "csv", cause);
  assert.assertEquals(error.name, "SerializationError");
  assert.assertEquals(error.format, "csv");
  assert.assertEquals(error.cause, cause);
});

Deno.test("SerializationError without cause should have undefined cause", () => {
  const error = new SerializationError("serialize failed", "json");
  assert.assertEquals(error.cause, undefined);
});

Deno.test("DeserializationError should have correct properties", () => {
  const cause = new Error("parse error");
  const error = new DeserializationError("parse failed", "json", cause);
  assert.assertEquals(error.name, "DeserializationError");
  assert.assertEquals(error.format, "json");
  assert.assertEquals(error.cause, cause);
});

Deno.test("DeserializationError without cause should work", () => {
  const error = new DeserializationError("parse failed", "yaml");
  assert.assertEquals(error.name, "DeserializationError");
  assert.assertEquals(error.format, "yaml");
  assert.assertEquals(error.cause, undefined);
});

// Format Registry Tests for Coverage
Deno.test("format registry unregister by extension works", () => {
  const testFmt: WriterFormat = {
    name: "ext-test-fmt",
    extensions: [".exttest"],
    writeItem: (data) => String(data),
  };
  registerFormat(testFmt);
  assert.assertEquals(hasFormat(".exttest"), true);
  assert.assertEquals(hasFormat("ext-test-fmt"), true);

  unregisterFormat("ext-test-fmt");
  assert.assertEquals(hasFormat(".exttest"), false);
  assert.assertEquals(hasFormat("ext-test-fmt"), false);
});

Deno.test("format registry clear removes all formats", () => {
  const registry = createRegistry();
  registry.register({
    name: "clear-test-1",
    extensions: [".ct1"],
    writeItem: (data) => String(data),
  });
  registry.register({
    name: "clear-test-2",
    extensions: [".ct2"],
    writeItem: (data) => String(data),
  });

  assert.assertEquals(registry.list().length, 2);
  registry.clear();
  assert.assertEquals(registry.list().length, 0);
  assert.assertEquals(registry.has("clear-test-1"), false);
  assert.assertEquals(registry.has("clear-test-2"), false);
});

Deno.test("format registry get with uppercase extension normalizes", () => {
  const registry = createRegistry();
  registry.register({
    name: "case-test",
    extensions: [".CaseTest"],
    writeItem: (data) => String(data),
  });

  // Should normalize to lowercase for extension lookup
  assert.assertEquals(registry.get(".casetest") !== undefined, true);
  assert.assertEquals(registry.get(".CASETEST") !== undefined, true);
  // Name lookup is also normalized
  assert.assertEquals(registry.get("case-test") !== undefined, true);
  assert.assertEquals(registry.get("CASE-TEST") !== undefined, true);
});

Deno.test("format registry get by name without dot prefix", () => {
  const registry = createRegistry();
  registry.register({
    name: "no-dot-test",
    extensions: [".ndt"],
    writeItem: (data) => String(data),
  });

  // Should find by name
  assert.assertEquals(registry.get("no-dot-test") !== undefined, true);
  // Should also find by extension without dot
  assert.assertEquals(registry.get("ndt") !== undefined, true);
});

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { serialize } from "./serializer.ts";
import { deserialize } from "./deserializer.ts";
import {
  createRegistry,
  hasFormat,
  listFormats,
  registerFormat,
} from "./format-registry.ts";
import {
  DeserializationError,
  FormatError,
  FormatNotFoundError,
  SerializationError,
} from "./types.ts";

import { jsonFormat } from "./formats/json.ts";
import { jsonlFormat } from "./formats/jsonl.ts";
import { yamlFormat } from "./formats/yaml.ts";
import { csvFormat } from "./formats/csv.ts";
import { tomlFormat } from "./formats/toml.ts";

// Register all built-in formats for testing
registerFormat(jsonFormat);
registerFormat(jsonlFormat);
registerFormat(yamlFormat);
registerFormat(csvFormat);
registerFormat(tomlFormat);

// =============================================================================
// Test Data
// =============================================================================

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

// =============================================================================
// Serializer Tests (ported from @eser/writer)
// =============================================================================

Deno.test("serialize() should serialize JSON format", () => {
  const result = serialize(testData, "json");
  const parsed = JSON.parse(result);
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
  assert.assertStringIncludes(result, "name");
  assert.assertStringIncludes(result, "app1");
  assert.assertStringIncludes(result, "app2");
});

Deno.test("serialize() should serialize TOML format", () => {
  const result = serialize(testData, "toml");
  assert.assertStringIncludes(result, "test-app");
  assert.assertStringIncludes(result, "1.0.0");
  assert.assertStringIncludes(result, "replicas");
});

Deno.test("serialize() should serialize JSONL format", () => {
  const result = serialize(testArray, "jsonl");
  const lines = result.trim().split("\n");
  assert.assertEquals(lines.length, 2);
  assert.assertEquals(JSON.parse(lines[0]!)["name"], "app1");
  assert.assertEquals(JSON.parse(lines[1]!)["name"], "app2");
});

Deno.test("serialize() should throw FormatNotFoundError for unknown format", () => {
  assert.assertThrows(
    () => serialize(testData, "unknown-format"),
    FormatNotFoundError,
  );
});

Deno.test("serialize() should throw SerializationError for circular references in JSON", () => {
  const circular: Record<string, unknown> = { name: "test" };
  circular["self"] = circular;
  assert.assertThrows(
    () => serialize(circular, "json"),
    SerializationError,
  );
});

// =============================================================================
// Deserializer Tests (new)
// =============================================================================

Deno.test("deserialize() should deserialize JSON", () => {
  const input = '[{"name":"app1"},{"name":"app2"}]';
  const result = deserialize(input, "json");
  assert.assertEquals(result.length, 2);
  assert.assertEquals((result[0] as Record<string, unknown>)["name"], "app1");
  assert.assertEquals((result[1] as Record<string, unknown>)["name"], "app2");
});

Deno.test("deserialize() should deserialize single JSON object", () => {
  const input = '{"name":"app1"}';
  const result = deserialize(input, "json");
  assert.assertEquals(result.length, 1);
  assert.assertEquals((result[0] as Record<string, unknown>)["name"], "app1");
});

Deno.test("deserialize() should return empty array for empty JSON input", () => {
  const result = deserialize("", "json");
  assert.assertEquals(result.length, 0);
});

Deno.test("deserialize() should deserialize JSONL", () => {
  const input = '{"name":"app1"}\n{"name":"app2"}\n';
  const result = deserialize(input, "jsonl");
  assert.assertEquals(result.length, 2);
  assert.assertEquals((result[0] as Record<string, unknown>)["name"], "app1");
  assert.assertEquals((result[1] as Record<string, unknown>)["name"], "app2");
});

Deno.test("deserialize() should handle JSONL with empty lines", () => {
  const input = '{"name":"app1"}\n\n{"name":"app2"}\n';
  const result = deserialize(input, "jsonl");
  assert.assertEquals(result.length, 2);
});

Deno.test("deserialize() should return empty array for empty JSONL input", () => {
  const result = deserialize("", "jsonl");
  assert.assertEquals(result.length, 0);
});

Deno.test("deserialize() should deserialize YAML", () => {
  const input = "name: app1\nversion: 1.0.0\n---\nname: app2\nversion: 2.0.0\n";
  const result = deserialize(input, "yaml");
  assert.assertEquals(result.length, 2);
  assert.assertEquals((result[0] as Record<string, unknown>)["name"], "app1");
  assert.assertEquals((result[1] as Record<string, unknown>)["name"], "app2");
});

Deno.test("deserialize() should deserialize single YAML document", () => {
  const input = "name: app1\nversion: 1.0.0\n";
  const result = deserialize(input, "yaml");
  assert.assertEquals(result.length, 1);
  assert.assertEquals((result[0] as Record<string, unknown>)["name"], "app1");
});

Deno.test("deserialize() should return empty array for empty YAML input", () => {
  const result = deserialize("", "yaml");
  assert.assertEquals(result.length, 0);
});

Deno.test("deserialize() should deserialize TOML", () => {
  const input = 'name = "app1"\nversion = "1.0.0"\n';
  const result = deserialize(input, "toml");
  assert.assertEquals(result.length, 1);
  assert.assertEquals((result[0] as Record<string, unknown>)["name"], "app1");
});

Deno.test("deserialize() should return empty array for empty TOML input", () => {
  const result = deserialize("", "toml");
  assert.assertEquals(result.length, 0);
});

Deno.test("deserialize() should deserialize CSV with auto-detected headers", () => {
  const input = "name,version\napp1,1.0.0\napp2,2.0.0\n";
  const result = deserialize(input, "csv");
  assert.assertEquals(result.length, 2);
  assert.assertEquals((result[0] as Record<string, unknown>)["name"], "app1");
  assert.assertEquals(
    (result[1] as Record<string, unknown>)["version"],
    "2.0.0",
  );
});

Deno.test("deserialize() should deserialize CSV with provided headers", () => {
  const input = "app1,1.0.0\napp2,2.0.0\n";
  const result = deserialize(input, "csv", { headers: ["name", "version"] });
  assert.assertEquals(result.length, 2);
  assert.assertEquals((result[0] as Record<string, unknown>)["name"], "app1");
});

Deno.test("deserialize() should return empty array for empty CSV input", () => {
  const result = deserialize("", "csv");
  assert.assertEquals(result.length, 0);
});

Deno.test("deserialize() should throw FormatNotFoundError for unknown format", () => {
  assert.assertThrows(
    () => deserialize("data", "unknown-format"),
    FormatNotFoundError,
  );
});

Deno.test("deserialize() should throw DeserializationError for malformed JSON", () => {
  assert.assertThrows(
    () => deserialize("{invalid json}", "json"),
    DeserializationError,
  );
});

Deno.test("deserialize() should throw DeserializationError for malformed JSONL", () => {
  assert.assertThrows(
    () => deserialize("{invalid}\n", "jsonl"),
    DeserializationError,
  );
});

// =============================================================================
// Roundtrip Tests
// =============================================================================

Deno.test("roundtrip: JSON serialize/deserialize", () => {
  const data = [{ name: "app1", count: 42 }, { name: "app2", count: 7 }];
  const serialized = serialize(data, "json");
  const deserialized = deserialize(serialized, "json");
  assert.assertEquals(deserialized, data);
});

Deno.test("roundtrip: JSONL serialize/deserialize", () => {
  const data = [{ name: "app1", count: 42 }, { name: "app2", count: 7 }];
  const serialized = serialize(data, "jsonl");
  const deserialized = deserialize(serialized, "jsonl");
  assert.assertEquals(deserialized, data);
});

Deno.test("roundtrip: YAML serialize/deserialize", () => {
  const data = [{ name: "app1", count: 42 }, { name: "app2", count: 7 }];
  const serialized = serialize(data, "yaml");
  const deserialized = deserialize(serialized, "yaml");
  assert.assertEquals(deserialized, data);
});

Deno.test("roundtrip: TOML serialize/deserialize", () => {
  const data = [{ name: "app1", count: 42 }, { name: "app2", count: 7 }];
  const serialized = serialize(data, "toml");
  const deserialized = deserialize(serialized, "toml");
  assert.assertEquals(deserialized, data);
});

// =============================================================================
// FormatReader Streaming Tests
// =============================================================================

Deno.test("JSONL FormatReader should handle partial lines across chunks", () => {
  const reader = jsonlFormat.createReader();
  const items1 = reader.push('{"name":"ap');
  assert.assertEquals(items1.length, 0); // incomplete line

  const items2 = reader.push('p1"}\n{"name":"app2"}\n');
  assert.assertEquals(items2.length, 2);
  assert.assertEquals((items2[0] as Record<string, unknown>)["name"], "app1");
  assert.assertEquals((items2[1] as Record<string, unknown>)["name"], "app2");
});

Deno.test("JSONL FormatReader should flush remaining buffer", () => {
  const reader = jsonlFormat.createReader();
  reader.push('{"name":"app1"}\n{"name":"app2"}');
  // "app2" has no trailing newline, still in buffer
  const flushed = reader.flush();
  assert.assertEquals(flushed.length, 1);
  assert.assertEquals((flushed[0] as Record<string, unknown>)["name"], "app2");
});

Deno.test("YAML FormatReader should split on --- separator", () => {
  const reader = yamlFormat.createReader();
  const items = reader.push("name: app1\n---\nname: app2\n---\n");
  assert.assertEquals(items.length, 2);
  assert.assertEquals((items[0] as Record<string, unknown>)["name"], "app1");
  assert.assertEquals((items[1] as Record<string, unknown>)["name"], "app2");
});

Deno.test("YAML FormatReader flush should handle remaining document", () => {
  const reader = yamlFormat.createReader();
  const items = reader.push("name: app1\n---\nname: app2");
  assert.assertEquals(items.length, 1); // only first doc complete
  const flushed = reader.flush();
  assert.assertEquals(flushed.length, 1);
  assert.assertEquals((flushed[0] as Record<string, unknown>)["name"], "app2");
});

Deno.test("TOML FormatReader should split on +++ separator", () => {
  const reader = tomlFormat.createReader();
  const items = reader.push('name = "app1"\n+++\nname = "app2"\n+++\n');
  assert.assertEquals(items.length, 2);
  assert.assertEquals((items[0] as Record<string, unknown>)["name"], "app1");
  assert.assertEquals((items[1] as Record<string, unknown>)["name"], "app2");
});

Deno.test("CSV FormatReader should parse rows after header", () => {
  const reader = csvFormat.createReader();
  const items = reader.push("name,version\napp1,1.0.0\napp2,2.0.0\n");
  assert.assertEquals(items.length, 2);
  assert.assertEquals((items[0] as Record<string, unknown>)["name"], "app1");
});

Deno.test("CSV FormatReader should use provided headers", () => {
  const reader = csvFormat.createReader({ headers: ["name", "version"] });
  const items = reader.push("app1,1.0.0\napp2,2.0.0\n");
  assert.assertEquals(items.length, 2);
  assert.assertEquals((items[0] as Record<string, unknown>)["name"], "app1");
});

Deno.test("JSON FormatReader buffers everything until flush", () => {
  const reader = jsonFormat.createReader();
  const items1 = reader.push('[{"name":"app1"}');
  assert.assertEquals(items1.length, 0); // buffered

  const items2 = reader.push(',{"name":"app2"}]');
  assert.assertEquals(items2.length, 0); // still buffered

  const flushed = reader.flush();
  assert.assertEquals(flushed.length, 2);
  assert.assertEquals((flushed[0] as Record<string, unknown>)["name"], "app1");
});

// =============================================================================
// Format Registry Tests
// =============================================================================

Deno.test("format registry should look up by name", () => {
  assert.assertEquals(hasFormat("json"), true);
  assert.assertEquals(hasFormat("yaml"), true);
  assert.assertEquals(hasFormat("csv"), true);
  assert.assertEquals(hasFormat("toml"), true);
  assert.assertEquals(hasFormat("jsonl"), true);
});

Deno.test("format registry should look up by extension", () => {
  assert.assertEquals(hasFormat(".json"), true);
  assert.assertEquals(hasFormat(".yaml"), true);
  assert.assertEquals(hasFormat(".yml"), true);
  assert.assertEquals(hasFormat(".csv"), true);
  assert.assertEquals(hasFormat(".toml"), true);
  assert.assertEquals(hasFormat(".jsonl"), true);
  assert.assertEquals(hasFormat(".ndjson"), true);
});

Deno.test("format registry should list unique formats", () => {
  const formats = listFormats();
  assert.assertEquals(formats.length >= 5, true);
});

Deno.test("createRegistry should create isolated registry", () => {
  const registry = createRegistry();
  assert.assertEquals(registry.has("json"), false);
  registry.register(jsonFormat);
  assert.assertEquals(registry.has("json"), true);
  // Global registry still has all formats
  assert.assertEquals(hasFormat("yaml"), true);
});

Deno.test("unregisterFormat should remove format", () => {
  const registry = createRegistry();
  registry.register(jsonFormat);
  assert.assertEquals(registry.has("json"), true);
  registry.unregister("json");
  assert.assertEquals(registry.has("json"), false);
});

// =============================================================================
// Coverage Gap Tests — format error paths and edge cases
// =============================================================================

Deno.test("registry register() should reject format with no name", () => {
  const registry = createRegistry();
  assert.assertThrows(
    () =>
      registry.register({
        name: "",
        extensions: [".x"],
        streamable: false,
        writeItem: () => "",
        createReader: () => ({ push: () => [], flush: () => [] }),
      }),
    Error,
    "must have a name",
  );
});

Deno.test("registry register() should reject format with no extensions", () => {
  const registry = createRegistry();
  assert.assertThrows(
    () =>
      registry.register({
        name: "x",
        extensions: [],
        streamable: false,
        writeItem: () => "",
        createReader: () => ({ push: () => [], flush: () => [] }),
      }),
    Error,
    "at least one extension",
  );
});

Deno.test("registry unregister() should be no-op for unknown format", () => {
  const registry = createRegistry();
  registry.unregister("nonexistent"); // should not throw
});

Deno.test("deserialize() should throw DeserializationError for malformed YAML", () => {
  assert.assertThrows(
    () => deserialize(":\n  :\n    - :", "yaml"),
    Error,
  );
});

Deno.test("deserialize() should throw DeserializationError for malformed TOML", () => {
  assert.assertThrows(
    () => deserialize("[invalid\ntoml = ", "toml"),
    Error,
  );
});

Deno.test("serialize() should handle single non-array item", () => {
  const result = serialize({ key: "value" }, "jsonl");
  assert.assertStringIncludes(result, '"key"');
});

Deno.test("TOML serialize should reject non-object data", () => {
  assert.assertThrows(
    () => serialize("plain string", "toml"),
    SerializationError,
  );
});

Deno.test("CSV writeItem should handle empty array input", () => {
  const result = csvFormat.writeItem([]);
  assert.assertEquals(result, "");
});

Deno.test("CSV writeItem should normalize primitives to {value: x}", () => {
  const result = csvFormat.writeItem("hello", {
    _isFirst: true,
    _inArray: true,
  });
  assert.assertStringIncludes(result, "hello");
});

Deno.test("CSV FormatReader flush on empty buffer should return empty", () => {
  const reader = csvFormat.createReader();
  assert.assertEquals(reader.flush(), []);
});

Deno.test("CSV FormatReader with only header line should return empty", () => {
  const reader = csvFormat.createReader();
  reader.push("name,version\n");
  assert.assertEquals(reader.flush(), []);
});

Deno.test("JSONL FormatReader flush on empty buffer should return empty", () => {
  const reader = jsonlFormat.createReader();
  assert.assertEquals(reader.flush(), []);
});

Deno.test("JSON FormatReader flush on empty buffer should return empty", () => {
  const reader = jsonFormat.createReader();
  assert.assertEquals(reader.flush(), []);
});

Deno.test("YAML FormatReader flush on empty buffer should return empty", () => {
  const reader = yamlFormat.createReader();
  assert.assertEquals(reader.flush(), []);
});

Deno.test("TOML FormatReader flush on empty buffer should return empty", () => {
  const reader = tomlFormat.createReader();
  assert.assertEquals(reader.flush(), []);
});

Deno.test("TOML FormatReader flush should handle remaining document", () => {
  const reader = tomlFormat.createReader();
  reader.push('name = "app1"\n+++\nname = "app2"');
  const flushed = reader.flush();
  assert.assertEquals(flushed.length, 1);
  assert.assertEquals((flushed[0] as Record<string, unknown>)["name"], "app2");
});

Deno.test("JSON writeStart/writeEnd without pretty", () => {
  const start = jsonFormat.writeStart!();
  const end = jsonFormat.writeEnd!();
  assert.assertEquals(start, "[");
  assert.assertEquals(end, "]\n");
});

Deno.test("JSON writeItem not in array mode", () => {
  const result = jsonFormat.writeItem({ a: 1 }, { _inArray: false });
  assert.assertStringIncludes(result, '"a"');
});

// =============================================================================
// Error Class Tests
// =============================================================================

Deno.test("FormatError should include format name", () => {
  const err = new FormatError("test error", "json");
  assert.assertEquals(err.format, "json");
  assert.assertEquals(err.name, "FormatError");
});

Deno.test("FormatNotFoundError should include format name in message", () => {
  const err = new FormatNotFoundError("xml");
  assert.assertStringIncludes(err.message, "xml");
  assert.assertEquals(err.name, "FormatNotFoundError");
});

Deno.test("SerializationError should chain cause", () => {
  const cause = new Error("root cause");
  const err = new SerializationError("failed", "json", cause);
  assert.assertEquals(err.cause, cause);
  assert.assertEquals(err.format, "json");
});

Deno.test("DeserializationError should chain cause", () => {
  const cause = new Error("parse failed");
  const err = new DeserializationError("failed", "json", cause);
  assert.assertEquals(err.cause, cause);
  assert.assertEquals(err.format, "json");
});

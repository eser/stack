// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
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
// Serializer Tests
// =============================================================================

describe({ name: "serialize()", sanitizeResources: false }, () => {
  it("should serialize JSON format", async () => {
    const result = await serialize(testData, "json");
    const parsed = JSON.parse(result);
    assert.assertEquals(parsed[0].name, "test-app");
    assert.assertEquals(parsed[0].config.replicas, 3);
  });

  it("should serialize JSON with pretty formatting", async () => {
    const result = await serialize(testData, "json", { pretty: true });
    assert.assertStringIncludes(result, "\n");
    assert.assertStringIncludes(result, "  ");
  });

  it("should serialize YAML format", async () => {
    const result = await serialize(testData, "yaml");
    assert.assertStringIncludes(result, "name: test-app");
    assert.assertStringIncludes(result, "version: 1.0.0");
    assert.assertStringIncludes(result, "replicas: 3");
  });

  it("should serialize YAML array with separator", async () => {
    // Go formatfx uses single-document sequence notation (- item) for arrays
    // instead of multi-document --- separators. Both are valid YAML.
    const result = await serialize(testArray, "yaml", { separator: "---" });
    assert.assertStringIncludes(result, "name: app1");
    assert.assertStringIncludes(result, "- ");
    assert.assertStringIncludes(result, "name: app2");
  });

  it("should serialize CSV format", async () => {
    const csvData = [
      { name: "app1", version: "1.0.0", replicas: 3 },
      { name: "app2", version: "2.0.0", replicas: 2 },
    ];
    const result = await serialize(csvData, "csv");
    assert.assertStringIncludes(result, "name");
    assert.assertStringIncludes(result, "app1");
    assert.assertStringIncludes(result, "app2");
  });

  it("should serialize TOML format", async () => {
    const result = await serialize(testData, "toml");
    assert.assertStringIncludes(result, "test-app");
    assert.assertStringIncludes(result, "1.0.0");
    assert.assertStringIncludes(result, "replicas");
  });

  it("should serialize JSONL format", async () => {
    const result = await serialize(testArray, "jsonl");
    const lines = result.trim().split("\n");
    assert.assertEquals(lines.length, 2);
    assert.assertEquals(JSON.parse(lines[0]!)["name"], "app1");
    assert.assertEquals(JSON.parse(lines[1]!)["name"], "app2");
  });

  it("should throw FormatNotFoundError for unknown format", async () => {
    await assert.assertRejects(
      () => serialize(testData, "unknown-format"),
      FormatNotFoundError,
    );
  });

  it("should throw SerializationError for circular references in JSON", async () => {
    const circular: Record<string, unknown> = { name: "test" };
    circular["self"] = circular;
    await assert.assertRejects(
      () => serialize(circular, "json"),
      SerializationError,
    );
  });

  it("should handle single non-array item", async () => {
    const result = await serialize({ key: "value" }, "jsonl");
    assert.assertStringIncludes(result, '"key"');
  });

  it("should reject non-object data for TOML", async () => {
    await assert.assertRejects(
      () => serialize("plain string", "toml"),
      SerializationError,
    );
  });
});

// =============================================================================
// Deserializer Tests
// =============================================================================

describe("deserialize()", () => {
  it("should deserialize JSON array", async () => {
    const input = '[{"name":"app1"},{"name":"app2"}]';
    const result = await deserialize(input, "json");
    assert.assertEquals(result.length, 2);
    assert.assertEquals((result[0] as Record<string, unknown>)["name"], "app1");
    assert.assertEquals((result[1] as Record<string, unknown>)["name"], "app2");
  });

  it("should deserialize single JSON object", async () => {
    const input = '{"name":"app1"}';
    const result = await deserialize(input, "json");
    assert.assertEquals(result.length, 1);
    assert.assertEquals((result[0] as Record<string, unknown>)["name"], "app1");
  });

  it("should return empty array for empty JSON input", async () => {
    const result = await deserialize("", "json");
    assert.assertEquals(result.length, 0);
  });

  it("should deserialize JSONL", async () => {
    const input = '{"name":"app1"}\n{"name":"app2"}\n';
    const result = await deserialize(input, "jsonl");
    assert.assertEquals(result.length, 2);
    assert.assertEquals((result[0] as Record<string, unknown>)["name"], "app1");
    assert.assertEquals((result[1] as Record<string, unknown>)["name"], "app2");
  });

  it("should handle JSONL with empty lines", async () => {
    const input = '{"name":"app1"}\n\n{"name":"app2"}\n';
    const result = await deserialize(input, "jsonl");
    assert.assertEquals(result.length, 2);
  });

  it("should return empty array for empty JSONL input", async () => {
    const result = await deserialize("", "jsonl");
    assert.assertEquals(result.length, 0);
  });

  it("should deserialize YAML multi-document", async () => {
    const input = "name: app1\nversion: 1.0.0\n---\nname: app2\nversion: 2.0.0\n";
    const result = await deserialize(input, "yaml");
    assert.assertEquals(result.length, 2);
    assert.assertEquals((result[0] as Record<string, unknown>)["name"], "app1");
    assert.assertEquals((result[1] as Record<string, unknown>)["name"], "app2");
  });

  it("should deserialize single YAML document", async () => {
    const input = "name: app1\nversion: 1.0.0\n";
    const result = await deserialize(input, "yaml");
    assert.assertEquals(result.length, 1);
    assert.assertEquals((result[0] as Record<string, unknown>)["name"], "app1");
  });

  it("should return empty array for empty YAML input", async () => {
    const result = await deserialize("", "yaml");
    assert.assertEquals(result.length, 0);
  });

  it("should deserialize TOML", async () => {
    const input = 'name = "app1"\nversion = "1.0.0"\n';
    const result = await deserialize(input, "toml");
    assert.assertEquals(result.length, 1);
    assert.assertEquals((result[0] as Record<string, unknown>)["name"], "app1");
  });

  it("should return empty array for empty TOML input", async () => {
    const result = await deserialize("", "toml");
    assert.assertEquals(result.length, 0);
  });

  it("should deserialize CSV with auto-detected headers", async () => {
    const input = "name,version\napp1,1.0.0\napp2,2.0.0\n";
    const result = await deserialize(input, "csv");
    assert.assertEquals(result.length, 2);
    assert.assertEquals((result[0] as Record<string, unknown>)["name"], "app1");
    assert.assertEquals(
      (result[1] as Record<string, unknown>)["version"],
      "2.0.0",
    );
  });

  it("should deserialize CSV with provided headers", async () => {
    const input = "app1,1.0.0\napp2,2.0.0\n";
    const result = await deserialize(input, "csv", {
      headers: ["name", "version"],
    });
    assert.assertEquals(result.length, 2);
    assert.assertEquals((result[0] as Record<string, unknown>)["name"], "app1");
  });

  it("should return empty array for empty CSV input", async () => {
    const result = await deserialize("", "csv");
    assert.assertEquals(result.length, 0);
  });

  it("should throw FormatNotFoundError for unknown format", async () => {
    await assert.assertRejects(
      () => deserialize("data", "unknown-format"),
      FormatNotFoundError,
    );
  });

  it("should throw DeserializationError for malformed JSON", async () => {
    await assert.assertRejects(
      () => deserialize("{invalid json}", "json"),
      DeserializationError,
    );
  });

  it("should throw DeserializationError for malformed JSONL", async () => {
    await assert.assertRejects(
      () => deserialize("{invalid}\n", "jsonl"),
      DeserializationError,
    );
  });

  it("should throw error for malformed YAML", async () => {
    await assert.assertRejects(
      () => deserialize("{\ninvalid: yaml: [broken", "yaml"),
      Error,
    );
  });

  it("should throw error for malformed TOML", async () => {
    await assert.assertRejects(
      () => deserialize("[invalid\ntoml = ", "toml"),
      Error,
    );
  });
});

// =============================================================================
// Roundtrip Tests
// =============================================================================

describe("roundtrip", () => {
  it("JSON serialize/deserialize", async () => {
    const data = [{ name: "app1", count: 42 }, { name: "app2", count: 7 }];
    const serialized = await serialize(data, "json");
    const deserialized = await deserialize(serialized, "json");
    assert.assertEquals(deserialized, data);
  });

  it("JSONL serialize/deserialize", async () => {
    const data = [{ name: "app1", count: 42 }, { name: "app2", count: 7 }];
    const serialized = await serialize(data, "jsonl");
    const deserialized = await deserialize(serialized, "jsonl");
    assert.assertEquals(deserialized, data);
  });

  it("YAML serialize/deserialize", async () => {
    const data = [{ name: "app1", count: 42 }, { name: "app2", count: 7 }];
    const serialized = await serialize(data, "yaml");
    const deserialized = await deserialize(serialized, "yaml");
    assert.assertEquals(deserialized, data);
  });

  it("TOML serialize/deserialize", async () => {
    const data = [{ name: "app1", count: 42 }, { name: "app2", count: 7 }];
    const serialized = await serialize(data, "toml");
    const deserialized = await deserialize(serialized, "toml");
    assert.assertEquals(deserialized, data);
  });
});

// =============================================================================
// FormatReader Streaming Tests
// =============================================================================

describe("FormatReader streaming", () => {
  it("JSONL should handle partial lines across chunks", () => {
    const reader = jsonlFormat.createReader();
    const items1 = reader.push('{"name":"ap');
    assert.assertEquals(items1.length, 0); // incomplete line

    const items2 = reader.push('p1"}\n{"name":"app2"}\n');
    assert.assertEquals(items2.length, 2);
    assert.assertEquals(
      (items2[0] as Record<string, unknown>)["name"],
      "app1",
    );
    assert.assertEquals(
      (items2[1] as Record<string, unknown>)["name"],
      "app2",
    );
  });

  it("JSONL should flush remaining buffer", () => {
    const reader = jsonlFormat.createReader();
    reader.push('{"name":"app1"}\n{"name":"app2"}');
    const flushed = reader.flush();
    assert.assertEquals(flushed.length, 1);
    assert.assertEquals(
      (flushed[0] as Record<string, unknown>)["name"],
      "app2",
    );
  });

  it("YAML should split on --- separator", () => {
    const reader = yamlFormat.createReader();
    const items = reader.push("name: app1\n---\nname: app2\n---\n");
    assert.assertEquals(items.length, 2);
    assert.assertEquals((items[0] as Record<string, unknown>)["name"], "app1");
    assert.assertEquals((items[1] as Record<string, unknown>)["name"], "app2");
  });

  it("YAML flush should handle remaining document", () => {
    const reader = yamlFormat.createReader();
    const items = reader.push("name: app1\n---\nname: app2");
    assert.assertEquals(items.length, 1);
    const flushed = reader.flush();
    assert.assertEquals(flushed.length, 1);
    assert.assertEquals(
      (flushed[0] as Record<string, unknown>)["name"],
      "app2",
    );
  });

  it("TOML should split on +++ separator", () => {
    const reader = tomlFormat.createReader();
    const items = reader.push('name = "app1"\n+++\nname = "app2"\n+++\n');
    assert.assertEquals(items.length, 2);
    assert.assertEquals((items[0] as Record<string, unknown>)["name"], "app1");
    assert.assertEquals((items[1] as Record<string, unknown>)["name"], "app2");
  });

  it("TOML flush should handle remaining document", () => {
    const reader = tomlFormat.createReader();
    reader.push('name = "app1"\n+++\nname = "app2"');
    const flushed = reader.flush();
    assert.assertEquals(flushed.length, 1);
    assert.assertEquals(
      (flushed[0] as Record<string, unknown>)["name"],
      "app2",
    );
  });

  it("CSV should parse rows after header", () => {
    const reader = csvFormat.createReader();
    const items = reader.push("name,version\napp1,1.0.0\napp2,2.0.0\n");
    assert.assertEquals(items.length, 2);
    assert.assertEquals((items[0] as Record<string, unknown>)["name"], "app1");
  });

  it("CSV should use provided headers", () => {
    const reader = csvFormat.createReader({ headers: ["name", "version"] });
    const items = reader.push("app1,1.0.0\napp2,2.0.0\n");
    assert.assertEquals(items.length, 2);
    assert.assertEquals((items[0] as Record<string, unknown>)["name"], "app1");
  });

  it("JSON buffers everything until flush", () => {
    const reader = jsonFormat.createReader();
    const items1 = reader.push('[{"name":"app1"}');
    assert.assertEquals(items1.length, 0);

    const items2 = reader.push(',{"name":"app2"}]');
    assert.assertEquals(items2.length, 0);

    const flushed = reader.flush();
    assert.assertEquals(flushed.length, 2);
    assert.assertEquals(
      (flushed[0] as Record<string, unknown>)["name"],
      "app1",
    );
  });

  it("JSONL flush on empty buffer should return empty", () => {
    const reader = jsonlFormat.createReader();
    assert.assertEquals(reader.flush(), []);
  });

  it("JSON flush on empty buffer should return empty", () => {
    const reader = jsonFormat.createReader();
    assert.assertEquals(reader.flush(), []);
  });

  it("YAML flush on empty buffer should return empty", () => {
    const reader = yamlFormat.createReader();
    assert.assertEquals(reader.flush(), []);
  });

  it("TOML flush on empty buffer should return empty", () => {
    const reader = tomlFormat.createReader();
    assert.assertEquals(reader.flush(), []);
  });

  it("CSV flush on empty buffer should return empty", () => {
    const reader = csvFormat.createReader();
    assert.assertEquals(reader.flush(), []);
  });

  it("CSV with only header line should return empty on flush", () => {
    const reader = csvFormat.createReader();
    reader.push("name,version\n");
    assert.assertEquals(reader.flush(), []);
  });
});

// =============================================================================
// Format Registry Tests
// =============================================================================

describe("format registry", () => {
  it("should look up by name", () => {
    assert.assertEquals(hasFormat("json"), true);
    assert.assertEquals(hasFormat("yaml"), true);
    assert.assertEquals(hasFormat("csv"), true);
    assert.assertEquals(hasFormat("toml"), true);
    assert.assertEquals(hasFormat("jsonl"), true);
  });

  it("should look up by extension", () => {
    assert.assertEquals(hasFormat("json"), true);
    assert.assertEquals(hasFormat("yaml"), true);
    assert.assertEquals(hasFormat("yml"), true);
    assert.assertEquals(hasFormat("csv"), true);
    assert.assertEquals(hasFormat("toml"), true);
    assert.assertEquals(hasFormat("jsonl"), true);
    assert.assertEquals(hasFormat("ndjson"), true);
  });

  it("should list unique formats", () => {
    const formats = listFormats();
    assert.assertEquals(formats.length >= 5, true);
  });

  it("createRegistry should create isolated registry", () => {
    const registry = createRegistry();
    assert.assertEquals(registry.has("json"), false);
    registry.register(jsonFormat);
    assert.assertEquals(registry.has("json"), true);
    assert.assertEquals(hasFormat("yaml"), true);
  });

  it("unregisterFormat should remove format", () => {
    const registry = createRegistry();
    registry.register(jsonFormat);
    assert.assertEquals(registry.has("json"), true);
    registry.unregister("json");
    assert.assertEquals(registry.has("json"), false);
  });

  it("register() should reject format with no name", () => {
    const registry = createRegistry();
    assert.assertThrows(
      () =>
        registry.register({
          name: "",
          extensions: ["x"],
          streamable: false,
          writeItem: () => "",
          createReader: () => ({ push: () => [], flush: () => [] }),
        }),
      Error,
      "must have a name",
    );
  });

  it("register() should reject format with no extensions", () => {
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

  it("unregister() should be no-op for unknown format", () => {
    const registry = createRegistry();
    registry.unregister("nonexistent");
  });
});

// =============================================================================
// Format Adapter Edge Cases
// =============================================================================

describe("format adapters", () => {
  it("JSON writeStart/writeEnd without pretty", () => {
    const start = jsonFormat.writeStart!();
    const end = jsonFormat.writeEnd!();
    assert.assertEquals(start, "[");
    assert.assertEquals(end, "]\n");
  });

  it("JSON writeItem not in array mode", () => {
    const result = jsonFormat.writeItem({ a: 1 }, { _inArray: false });
    assert.assertStringIncludes(result, '"a"');
  });

  it("CSV writeItem should handle empty array input", () => {
    const result = csvFormat.writeItem([]);
    assert.assertEquals(result, "");
  });

  it("CSV writeItem should normalize primitives to {value: x}", () => {
    const result = csvFormat.writeItem("hello", {
      _isFirst: true,
      _inArray: true,
    });
    assert.assertStringIncludes(result, "hello");
  });
});

// =============================================================================
// Error Class Tests
// =============================================================================

describe("error classes", () => {
  it("FormatError should include format name", () => {
    const err = new FormatError("test error", "json");
    assert.assertEquals(err.format, "json");
    assert.assertEquals(err.name, "FormatError");
  });

  it("FormatNotFoundError should include format name in message", () => {
    const err = new FormatNotFoundError("xml");
    assert.assertStringIncludes(err.message, "xml");
    assert.assertEquals(err.name, "FormatNotFoundError");
  });

  it("SerializationError should chain cause", () => {
    const cause = new Error("root cause");
    const err = new SerializationError("failed", "json", cause);
    assert.assertEquals(err.cause, cause);
    assert.assertEquals(err.format, "json");
  });

  it("DeserializationError should chain cause", () => {
    const cause = new Error("parse failed");
    const err = new DeserializationError("failed", "json", cause);
    assert.assertEquals(err.cause, cause);
    assert.assertEquals(err.format, "json");
  });
});

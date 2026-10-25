// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as serializer from "./serializer.ts";
import * as deserializer from "./deserializer.ts";
import * as formatRegistry from "./format-registry.ts";
import * as types from "./types.ts";
import * as streamLayers from "./stream-layers.ts";
import * as streams from "@eserstack/streams";

import * as json from "./formats/json.ts";
import * as jsonl from "./formats/jsonl.ts";
import * as yaml from "./formats/yaml.ts";
import * as csv from "./formats/csv.ts";
import * as toml from "./formats/toml.ts";

// Register all built-in formats for testing
formatRegistry.registerFormat(json.jsonFormat);
formatRegistry.registerFormat(jsonl.jsonlFormat);
formatRegistry.registerFormat(yaml.yamlFormat);
formatRegistry.registerFormat(csv.csvFormat);
formatRegistry.registerFormat(toml.tomlFormat);

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

bdd.describe("serialize()", () => {
  bdd.it("should serialize JSON format", async () => {
    const result = await serializer.serialize(testData, "json");
    const parsed = JSON.parse(result);
    assert.assertEquals(parsed.name, "test-app");
    assert.assertEquals(parsed.config.replicas, 3);
  });

  bdd.it("writes a single object as one JSON document", async () => {
    const result = await serializer.serialize(
      { name: "app", replicas: 3 },
      "json",
    );

    assert.assertEquals(result, '{"name":"app","replicas":3}\n');
  });

  bdd.it("writes a single object as one TOML table", async () => {
    const result = await serializer.serialize(
      { name: "app", replicas: 3 },
      "toml",
    );

    assert.assertEquals(result.includes("+++"), false);
    assert.assertEquals(await deserializer.deserialize(result, "toml"), [
      { name: "app", replicas: 3 },
    ]);
  });

  bdd.it("should serialize JSON with pretty formatting", async () => {
    const result = await serializer.serialize(testData, "json", {
      pretty: true,
    });
    assert.assertStringIncludes(result, "\n");
    assert.assertStringIncludes(result, "  ");
  });

  bdd.it("should serialize YAML format", async () => {
    const result = await serializer.serialize(testData, "yaml");
    assert.assertStringIncludes(result, "name: test-app");
    assert.assertStringIncludes(result, "version: 1.0.0");
    assert.assertStringIncludes(result, "replicas: 3");
  });

  bdd.it("should serialize YAML array with separator", async () => {
    // Go formatfx uses single-document sequence notation (- item) for arrays
    // instead of multi-document --- separators. Both are valid YAML.
    const result = await serializer.serialize(testArray, "yaml", {
      separator: "---",
    });
    assert.assertStringIncludes(result, "name: app1");
    assert.assertStringIncludes(result, "- ");
    assert.assertStringIncludes(result, "name: app2");
  });

  bdd.it("should serialize CSV format", async () => {
    const csvData = [
      { name: "app1", version: "1.0.0", replicas: 3 },
      { name: "app2", version: "2.0.0", replicas: 2 },
    ];
    const result = await serializer.serialize(csvData, "csv");
    assert.assertStringIncludes(result, "name");
    assert.assertStringIncludes(result, "app1");
    assert.assertStringIncludes(result, "app2");
  });

  bdd.it("should serialize TOML format", async () => {
    const result = await serializer.serialize(testData, "toml");
    assert.assertStringIncludes(result, "test-app");
    assert.assertStringIncludes(result, "1.0.0");
    assert.assertStringIncludes(result, "replicas");
  });

  bdd.it("should serialize JSONL format", async () => {
    const result = await serializer.serialize(testArray, "jsonl");
    const lines = result.trim().split("\n");
    assert.assertEquals(lines.length, 2);
    assert.assertEquals(JSON.parse(lines[0]!)["name"], "app1");
    assert.assertEquals(JSON.parse(lines[1]!)["name"], "app2");
  });

  bdd.it("should throw FormatNotFoundError for unknown format", async () => {
    await assert.assertRejects(
      () => serializer.serialize(testData, "unknown-format"),
      types.FormatNotFoundError,
    );
  });

  bdd.it(
    "should throw SerializationError for circular references in JSON",
    async () => {
      const circular: Record<string, unknown> = { name: "test" };
      circular["self"] = circular;
      await assert.assertRejects(
        () => serializer.serialize(circular, "json"),
        types.SerializationError,
      );
    },
  );

  bdd.it("should handle single non-array item", async () => {
    const result = await serializer.serialize({ key: "value" }, "jsonl");
    assert.assertStringIncludes(result, '"key"');
  });

  bdd.it("should reject non-object data for TOML", async () => {
    await assert.assertRejects(
      () => serializer.serialize("plain string", "toml"),
      types.SerializationError,
    );
  });
});

// =============================================================================
// Document Layout Tests (TypeScript formats, without the native library)
// =============================================================================

bdd.describe("serializeWith() without the native library", () => {
  const app = { name: "app", replicas: 3 };
  const apps = [
    { name: "app1", replicas: 1 },
    { name: "app2", replicas: 2 },
  ];

  const documentCases = [
    {
      name: "writes a single value as one JSON document",
      data: app,
      format: "json",
      options: {},
      expected: '{"name":"app","replicas":3}\n',
    },
    {
      name: "writes a single value as one pretty JSON document",
      data: app,
      format: "json",
      options: { pretty: true },
      expected: `${JSON.stringify(app, null, 2)}\n`,
    },
    {
      name: "writes a JSON array on one line",
      data: apps,
      format: "json",
      options: {},
      expected: `${JSON.stringify(apps)}\n`,
    },
    {
      name: "lays out a pretty JSON array as JSON.stringify does",
      data: apps,
      format: "json",
      options: { pretty: true },
      expected: `${JSON.stringify(apps, null, 2)}\n`,
    },
    {
      name: "applies the indent option to a pretty JSON array",
      data: apps,
      format: "json",
      options: { pretty: true, indent: 4 },
      expected: `${JSON.stringify(apps, null, 4)}\n`,
    },
    {
      name: "writes an empty JSON array",
      data: [],
      format: "json",
      options: {},
      expected: "[]\n",
    },
    {
      name: "writes a single value as one YAML mapping",
      data: app,
      format: "yaml",
      options: {},
      expected: "name: app\nreplicas: 3\n",
    },
    {
      name: "writes a single value as one TOML table with integers",
      data: app,
      format: "toml",
      options: { pretty: false },
      expected: 'name = "app"\nreplicas = 3\n',
    },
    {
      name: "writes a single value as one JSONL line",
      data: app,
      format: "jsonl",
      options: {},
      expected: '{"name":"app","replicas":3}\n',
    },
    {
      name: "writes a single value as a CSV header and one row",
      data: app,
      format: "csv",
      options: {},
      // @std/csv ends rows with CRLF, as RFC 4180 does.
      expected: "name,replicas\r\napp,3\r\n",
    },
  ];

  for (const { name, data, format, options, expected } of documentCases) {
    bdd.it(name, () => {
      assert.assertEquals(
        serializer.serializeWith(null, data, format, options),
        expected,
      );
    });
  }

  bdd.it("writes null for an undefined JSON array element", () => {
    assert.assertEquals(
      serializer.serializeWith(null, [1, undefined], "json"),
      "[1,null]\n",
    );
  });

  bdd.it("rejects an undefined JSON document", () => {
    assert.assertThrows(
      () => serializer.serializeWith(null, undefined, "json"),
      types.SerializationError,
      "no JSON form",
    );
  });

  bdd.it("reads a single JSON document back as one item", () => {
    const encoded = serializer.serializeWith(null, app, "json");

    assert.assertEquals(JSON.parse(encoded), app);
  });
});

// =============================================================================
// Stream Layer Tests
// =============================================================================

bdd.describe("streamLayers.writerLayer()", () => {
  bdd.it("writes the chunks as one JSON array", async () => {
    const chunks = await streams
      .pipeline()
      .from(streams.sources.values({ id: 1 }, { id: 2 }))
      .through(streamLayers.writerLayer("json"))
      .collect<string>();

    assert.assertEquals(JSON.parse(chunks.join("")), [{ id: 1 }, { id: 2 }]);
  });

  bdd.it("writes the CSV header before the first chunk only", async () => {
    const chunks = await streams
      .pipeline()
      .from(streams.sources.values({ id: 1 }, { id: 2 }))
      .through(streamLayers.writerLayer("csv"))
      .collect<string>();

    assert.assertEquals(chunks.join("").split("\r\n"), ["id", "1", "2", ""]);
  });
});

// =============================================================================
// Deserializer Tests
// =============================================================================

bdd.describe("deserialize()", () => {
  bdd.it("should deserialize JSON array", async () => {
    const input = '[{"name":"app1"},{"name":"app2"}]';
    const result = await deserializer.deserialize(input, "json");
    assert.assertEquals(result.length, 2);
    assert.assertEquals((result[0] as Record<string, unknown>)["name"], "app1");
    assert.assertEquals((result[1] as Record<string, unknown>)["name"], "app2");
  });

  bdd.it("should deserialize single JSON object", async () => {
    const input = '{"name":"app1"}';
    const result = await deserializer.deserialize(input, "json");
    assert.assertEquals(result.length, 1);
    assert.assertEquals((result[0] as Record<string, unknown>)["name"], "app1");
  });

  bdd.it("should return empty array for empty JSON input", async () => {
    const result = await deserializer.deserialize("", "json");
    assert.assertEquals(result.length, 0);
  });

  bdd.it("should deserialize JSONL", async () => {
    const input = '{"name":"app1"}\n{"name":"app2"}\n';
    const result = await deserializer.deserialize(input, "jsonl");
    assert.assertEquals(result.length, 2);
    assert.assertEquals((result[0] as Record<string, unknown>)["name"], "app1");
    assert.assertEquals((result[1] as Record<string, unknown>)["name"], "app2");
  });

  bdd.it("should handle JSONL with empty lines", async () => {
    const input = '{"name":"app1"}\n\n{"name":"app2"}\n';
    const result = await deserializer.deserialize(input, "jsonl");
    assert.assertEquals(result.length, 2);
  });

  bdd.it("should return empty array for empty JSONL input", async () => {
    const result = await deserializer.deserialize("", "jsonl");
    assert.assertEquals(result.length, 0);
  });

  bdd.it("should deserialize YAML multi-document", async () => {
    const input =
      "name: app1\nversion: 1.0.0\n---\nname: app2\nversion: 2.0.0\n";
    const result = await deserializer.deserialize(input, "yaml");
    assert.assertEquals(result.length, 2);
    assert.assertEquals((result[0] as Record<string, unknown>)["name"], "app1");
    assert.assertEquals((result[1] as Record<string, unknown>)["name"], "app2");
  });

  bdd.it("should deserialize single YAML document", async () => {
    const input = "name: app1\nversion: 1.0.0\n";
    const result = await deserializer.deserialize(input, "yaml");
    assert.assertEquals(result.length, 1);
    assert.assertEquals((result[0] as Record<string, unknown>)["name"], "app1");
  });

  bdd.it("should return empty array for empty YAML input", async () => {
    const result = await deserializer.deserialize("", "yaml");
    assert.assertEquals(result.length, 0);
  });

  bdd.it("should deserialize TOML", async () => {
    const input = 'name = "app1"\nversion = "1.0.0"\n';
    const result = await deserializer.deserialize(input, "toml");
    assert.assertEquals(result.length, 1);
    assert.assertEquals((result[0] as Record<string, unknown>)["name"], "app1");
  });

  bdd.it("should return empty array for empty TOML input", async () => {
    const result = await deserializer.deserialize("", "toml");
    assert.assertEquals(result.length, 0);
  });

  bdd.it("should deserialize CSV with auto-detected headers", async () => {
    const input = "name,version\napp1,1.0.0\napp2,2.0.0\n";
    const result = await deserializer.deserialize(input, "csv");
    assert.assertEquals(result.length, 2);
    assert.assertEquals((result[0] as Record<string, unknown>)["name"], "app1");
    assert.assertEquals(
      (result[1] as Record<string, unknown>)["version"],
      "2.0.0",
    );
  });

  bdd.it("should deserialize CSV with provided headers", async () => {
    const input = "app1,1.0.0\napp2,2.0.0\n";
    const result = await deserializer.deserialize(input, "csv", {
      headers: ["name", "version"],
    });
    assert.assertEquals(result.length, 2);
    assert.assertEquals((result[0] as Record<string, unknown>)["name"], "app1");
  });

  bdd.it("should return empty array for empty CSV input", async () => {
    const result = await deserializer.deserialize("", "csv");
    assert.assertEquals(result.length, 0);
  });

  bdd.it("should throw FormatNotFoundError for unknown format", async () => {
    await assert.assertRejects(
      () => deserializer.deserialize("data", "unknown-format"),
      types.FormatNotFoundError,
    );
  });

  bdd.it("should throw DeserializationError for malformed JSON", async () => {
    await assert.assertRejects(
      () => deserializer.deserialize("{invalid json}", "json"),
      types.DeserializationError,
    );
  });

  bdd.it("should throw DeserializationError for malformed JSONL", async () => {
    await assert.assertRejects(
      () => deserializer.deserialize("{invalid}\n", "jsonl"),
      types.DeserializationError,
    );
  });

  bdd.it("should throw error for malformed YAML", async () => {
    await assert.assertRejects(
      () => deserializer.deserialize("{\ninvalid: yaml: [broken", "yaml"),
      Error,
    );
  });

  bdd.it("should throw error for malformed TOML", async () => {
    await assert.assertRejects(
      () => deserializer.deserialize("[invalid\ntoml = ", "toml"),
      Error,
    );
  });
});

// =============================================================================
// Roundtrip Tests
// =============================================================================

bdd.describe("roundtrip", () => {
  bdd.it("JSON serialize/deserialize", async () => {
    const data = [
      { name: "app1", count: 42 },
      { name: "app2", count: 7 },
    ];
    const serialized = await serializer.serialize(data, "json");
    const deserialized = await deserializer.deserialize(serialized, "json");
    assert.assertEquals(deserialized, data);
  });

  bdd.it("JSONL serialize/deserialize", async () => {
    const data = [
      { name: "app1", count: 42 },
      { name: "app2", count: 7 },
    ];
    const serialized = await serializer.serialize(data, "jsonl");
    const deserialized = await deserializer.deserialize(serialized, "jsonl");
    assert.assertEquals(deserialized, data);
  });

  bdd.it("YAML serialize/deserialize", async () => {
    const data = [
      { name: "app1", count: 42 },
      { name: "app2", count: 7 },
    ];
    const serialized = await serializer.serialize(data, "yaml");
    const deserialized = await deserializer.deserialize(serialized, "yaml");
    assert.assertEquals(deserialized, data);
  });

  bdd.it("TOML serialize/deserialize", async () => {
    const data = [
      { name: "app1", count: 42 },
      { name: "app2", count: 7 },
    ];
    const serialized = await serializer.serialize(data, "toml");
    const deserialized = await deserializer.deserialize(serialized, "toml");
    assert.assertEquals(deserialized, data);
  });
});

// =============================================================================
// FormatReader Streaming Tests
// =============================================================================

bdd.describe("FormatReader streaming", () => {
  bdd.it("JSONL should handle partial lines across chunks", () => {
    const reader = jsonl.jsonlFormat.createReader();
    const items1 = reader.push('{"name":"ap');
    assert.assertEquals(items1.length, 0); // incomplete line

    const items2 = reader.push('p1"}\n{"name":"app2"}\n');
    assert.assertEquals(items2.length, 2);
    assert.assertEquals((items2[0] as Record<string, unknown>)["name"], "app1");
    assert.assertEquals((items2[1] as Record<string, unknown>)["name"], "app2");
  });

  bdd.it("JSONL should flush remaining buffer", () => {
    const reader = jsonl.jsonlFormat.createReader();
    reader.push('{"name":"app1"}\n{"name":"app2"}');
    const flushed = reader.flush();
    assert.assertEquals(flushed.length, 1);
    assert.assertEquals(
      (flushed[0] as Record<string, unknown>)["name"],
      "app2",
    );
  });

  bdd.it("YAML quotes strings a YAML 1.1 reader takes for other types", () => {
    // kubectl (sigs.k8s.io/yaml) and PyYAML read YAML 1.1, where an
    // unquoted yes, off or 1_000 is a boolean or a number, so a ConfigMap
    // value written that way fails to apply.
    const text = yaml.yamlFormat.writeItem({
      a: "yes",
      b: "off",
      c: "N",
      d: "1_000",
      e: "2001-12-14",
      f: "plain",
      g: true,
      h: 3,
    });
    assert.assertStringIncludes(text, 'a: "yes"\n');
    assert.assertStringIncludes(text, 'b: "off"\n');
    assert.assertStringIncludes(text, 'c: "N"\n');
    assert.assertStringIncludes(text, 'd: "1_000"\n');
    assert.assertStringIncludes(text, 'e: "2001-12-14"\n');
    assert.assertStringIncludes(text, "f: plain\n");
    assert.assertStringIncludes(text, "g: true\n");
    assert.assertStringIncludes(text, "h: 3\n");

    // The values read back as the same strings.
    const [read] = yaml.yamlFormat.createReader().push(text);
    assert.assertEquals((read as Record<string, unknown>)["a"], "yes");
    assert.assertEquals((read as Record<string, unknown>)["d"], "1_000");
  });

  bdd.it("YAML should split on --- separator", () => {
    const reader = yaml.yamlFormat.createReader();
    const items = reader.push("name: app1\n---\nname: app2\n---\n");
    assert.assertEquals(items.length, 2);
    assert.assertEquals((items[0] as Record<string, unknown>)["name"], "app1");
    assert.assertEquals((items[1] as Record<string, unknown>)["name"], "app2");
  });

  bdd.it("YAML flush should handle remaining document", () => {
    const reader = yaml.yamlFormat.createReader();
    const items = reader.push("name: app1\n---\nname: app2");
    assert.assertEquals(items.length, 1);
    const flushed = reader.flush();
    assert.assertEquals(flushed.length, 1);
    assert.assertEquals(
      (flushed[0] as Record<string, unknown>)["name"],
      "app2",
    );
  });

  bdd.it("TOML should split on +++ separator", () => {
    const reader = toml.tomlFormat.createReader();
    const items = reader.push('name = "app1"\n+++\nname = "app2"\n+++\n');
    assert.assertEquals(items.length, 2);
    assert.assertEquals((items[0] as Record<string, unknown>)["name"], "app1");
    assert.assertEquals((items[1] as Record<string, unknown>)["name"], "app2");
  });

  bdd.it("TOML flush should handle remaining document", () => {
    const reader = toml.tomlFormat.createReader();
    reader.push('name = "app1"\n+++\nname = "app2"');
    const flushed = reader.flush();
    assert.assertEquals(flushed.length, 1);
    assert.assertEquals(
      (flushed[0] as Record<string, unknown>)["name"],
      "app2",
    );
  });

  bdd.it("CSV should parse rows after header", () => {
    const reader = csv.csvFormat.createReader();
    const items = reader.push("name,version\napp1,1.0.0\napp2,2.0.0\n");
    assert.assertEquals(items.length, 2);
    assert.assertEquals((items[0] as Record<string, unknown>)["name"], "app1");
  });

  bdd.it("CSV should use provided headers", () => {
    const reader = csv.csvFormat.createReader({ headers: ["name", "version"] });
    const items = reader.push("app1,1.0.0\napp2,2.0.0\n");
    assert.assertEquals(items.length, 2);
    assert.assertEquals((items[0] as Record<string, unknown>)["name"], "app1");
  });

  bdd.it("JSON buffers everything until flush", () => {
    const reader = json.jsonFormat.createReader();
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

  bdd.it("JSONL flush on empty buffer should return empty", () => {
    const reader = jsonl.jsonlFormat.createReader();
    assert.assertEquals(reader.flush(), []);
  });

  bdd.it("JSON flush on empty buffer should return empty", () => {
    const reader = json.jsonFormat.createReader();
    assert.assertEquals(reader.flush(), []);
  });

  bdd.it("YAML flush on empty buffer should return empty", () => {
    const reader = yaml.yamlFormat.createReader();
    assert.assertEquals(reader.flush(), []);
  });

  bdd.it("TOML flush on empty buffer should return empty", () => {
    const reader = toml.tomlFormat.createReader();
    assert.assertEquals(reader.flush(), []);
  });

  bdd.it("CSV flush on empty buffer should return empty", () => {
    const reader = csv.csvFormat.createReader();
    assert.assertEquals(reader.flush(), []);
  });

  bdd.it("CSV with only header line should return empty on flush", () => {
    const reader = csv.csvFormat.createReader();
    reader.push("name,version\n");
    assert.assertEquals(reader.flush(), []);
  });
});

// =============================================================================
// Format Registry Tests
// =============================================================================

bdd.describe("format registry", () => {
  bdd.it("should look up by name", () => {
    assert.assertEquals(formatRegistry.hasFormat("json"), true);
    assert.assertEquals(formatRegistry.hasFormat("yaml"), true);
    assert.assertEquals(formatRegistry.hasFormat("csv"), true);
    assert.assertEquals(formatRegistry.hasFormat("toml"), true);
    assert.assertEquals(formatRegistry.hasFormat("jsonl"), true);
  });

  bdd.it("should look up by extension", () => {
    assert.assertEquals(formatRegistry.hasFormat("json"), true);
    assert.assertEquals(formatRegistry.hasFormat("yaml"), true);
    assert.assertEquals(formatRegistry.hasFormat("yml"), true);
    assert.assertEquals(formatRegistry.hasFormat("csv"), true);
    assert.assertEquals(formatRegistry.hasFormat("toml"), true);
    assert.assertEquals(formatRegistry.hasFormat("jsonl"), true);
    assert.assertEquals(formatRegistry.hasFormat("ndjson"), true);
  });

  bdd.it("should list unique formats", () => {
    const formats = formatRegistry.listFormats();
    assert.assertEquals(formats.length >= 5, true);
  });

  bdd.it("createRegistry should create isolated registry", () => {
    const registry = formatRegistry.createRegistry();
    assert.assertEquals(registry.has("json"), false);
    registry.register(json.jsonFormat);
    assert.assertEquals(registry.has("json"), true);
    assert.assertEquals(formatRegistry.hasFormat("yaml"), true);
  });

  bdd.it("unregisterFormat should remove format", () => {
    const registry = formatRegistry.createRegistry();
    registry.register(json.jsonFormat);
    assert.assertEquals(registry.has("json"), true);
    registry.unregister("json");
    assert.assertEquals(registry.has("json"), false);
  });

  bdd.it("register() should reject format with no name", () => {
    const registry = formatRegistry.createRegistry();
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

  bdd.it("register() should reject format with no extensions", () => {
    const registry = formatRegistry.createRegistry();
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

  bdd.it("unregister() should be no-op for unknown format", () => {
    const registry = formatRegistry.createRegistry();
    registry.unregister("nonexistent");
  });
});

// =============================================================================
// Format Adapter Edge Cases
// =============================================================================

bdd.describe("format adapters", () => {
  bdd.it("JSON writeStart/writeEnd without pretty", () => {
    const start = json.jsonFormat.writeStart!();
    const end = json.jsonFormat.writeEnd!();
    assert.assertEquals(start, "[");
    assert.assertEquals(end, "]\n");
  });

  bdd.it("JSON writeItem not in array mode", () => {
    const result = json.jsonFormat.writeItem({ a: 1 }, { _inArray: false });
    assert.assertStringIncludes(result, '"a"');
  });

  bdd.it("CSV writeItem should handle empty array input", () => {
    const result = csv.csvFormat.writeItem([]);
    assert.assertEquals(result, "");
  });

  bdd.it("CSV writeItem should normalize primitives to {value: x}", () => {
    const result = csv.csvFormat.writeItem("hello", {
      _isFirst: true,
      _inArray: true,
    });
    assert.assertStringIncludes(result, "hello");
  });
});

// =============================================================================
// Error Class Tests
// =============================================================================

bdd.describe("error classes", () => {
  bdd.it("FormatError should include format name", () => {
    const err = new types.FormatError("test error", "json");
    assert.assertEquals(err.format, "json");
    assert.assertEquals(err.name, "FormatError");
  });

  bdd.it("FormatNotFoundError should include format name in message", () => {
    const err = new types.FormatNotFoundError("xml");
    assert.assertStringIncludes(err.message, "xml");
    assert.assertEquals(err.name, "FormatNotFoundError");
  });

  bdd.it("SerializationError should chain cause", () => {
    const cause = new Error("root cause");
    const err = new types.SerializationError("failed", "json", cause);
    assert.assertEquals(err.cause, cause);
    assert.assertEquals(err.format, "json");
  });

  bdd.it("DeserializationError should chain cause", () => {
    const cause = new Error("parse failed");
    const err = new types.DeserializationError("failed", "json", cause);
    assert.assertEquals(err.cause, cause);
    assert.assertEquals(err.format, "json");
  });
});

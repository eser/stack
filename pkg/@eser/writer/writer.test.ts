// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { write } from "./writer.ts";
import {
  createRegistry,
  hasFormat,
  listFormats,
  registerFormat,
  unregisterFormat,
} from "./format-registry.ts";
import { FormatNotFoundError, type WriterFormat } from "./types.ts";

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

Deno.test("write() should serialize JSON format", () => {
  const result = write(testData, "json");
  const parsed = JSON.parse(result);
  assert.assertEquals(parsed.name, "test-app");
  assert.assertEquals(parsed.config.replicas, 3);
});

Deno.test("write() should serialize JSON with pretty formatting", () => {
  const result = write(testData, "json", { pretty: true });
  assert.assertStringIncludes(result, "\n");
  assert.assertStringIncludes(result, "  ");
});

Deno.test("write() should serialize YAML format", () => {
  const result = write(testData, "yaml");
  assert.assertStringIncludes(result, "name: test-app");
  assert.assertStringIncludes(result, "version: 1.0.0");
  assert.assertStringIncludes(result, "replicas: 3");
});

Deno.test("write() should serialize YAML array with separator", () => {
  const result = write(testArray, "yaml", { separator: "---" });
  assert.assertStringIncludes(result, "name: app1");
  assert.assertStringIncludes(result, "---");
  assert.assertStringIncludes(result, "name: app2");
});

Deno.test("write() should serialize CSV format", () => {
  const csvData = [
    { name: "app1", version: "1.0.0", replicas: 3 },
    { name: "app2", version: "2.0.0", replicas: 2 },
  ];

  const result = write(csvData, "csv");
  assert.assertStringIncludes(result, "name,version,replicas");
  assert.assertStringIncludes(result, "app1,1.0.0,3");
  assert.assertStringIncludes(result, "app2,2.0.0,2");
});

Deno.test("write() should serialize TOML format", () => {
  const result = write(testData, "toml");
  assert.assertStringIncludes(result, '"test-app"');
  assert.assertStringIncludes(result, '"1.0.0"');
  assert.assertStringIncludes(result, "[config]");
  assert.assertStringIncludes(result, "replicas = 3");
});

Deno.test("write() should throw FormatNotFoundError for unknown format", () => {
  assert.assertThrows(
    () => write(testData, "unknown"),
    FormatNotFoundError,
    "Format 'unknown' not found in registry",
  );
});

Deno.test("registerFormat() should allow custom formats", () => {
  const customFormat: WriterFormat = {
    name: "custom",
    extensions: [".custom"],
    serialize: (data) => `CUSTOM: ${JSON.stringify(data)}`,
  };

  registerFormat(customFormat);

  const result = write(testData, "custom");
  assert.assertEquals(result, `CUSTOM: ${JSON.stringify(testData)}`);
});

Deno.test("write() should handle TOML validation errors", () => {
  assert.assertThrows(
    () => write(["array", "not", "allowed"], "toml"),
    Error,
    "TOML format requires the root value to be an object",
  );
});

Deno.test("write() should handle empty data gracefully", () => {
  const jsonResult = write(null, "json");
  assert.assertEquals(jsonResult, "null");

  const yamlResult = write(null, "yaml");
  assert.assertStringIncludes(yamlResult, "null");

  const csvResult = write([], "csv");
  assert.assertEquals(csvResult, "");
});

Deno.test("write() should handle nested objects in CSV", () => {
  const complexData = [
    { name: "app1", config: { replicas: 3 } },
    { name: "app2", config: { replicas: 2 } },
  ];

  const result = write(complexData, "csv");
  // CSV will stringify nested objects
  assert.assertStringIncludes(result, "name,config");
});

// Format Registry Tests
Deno.test("unregisterFormat() should remove format by name", () => {
  const testFormat: WriterFormat = {
    name: "test-unregister",
    extensions: [".testun"],
    serialize: (data) => JSON.stringify(data),
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
    serialize: (data) => String(data),
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
        serialize: (data) => String(data),
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
        serialize: (data) => String(data),
      }),
    Error,
    "Format must define at least one extension",
  );
});

Deno.test("registerFormat() should throw for format without serialize", () => {
  assert.assertThrows(
    () =>
      registerFormat({
        name: "no-serialize",
        extensions: [".test"],
      } as WriterFormat),
    Error,
    "Format must implement serialize function",
  );
});

// JSON Format Tests
Deno.test("write() JSON with custom indent option", () => {
  const data = { name: "test" };
  const result = write(data, "json", { pretty: true, indent: 4 });
  assert.assertStringIncludes(result, "    "); // 4-space indent
});

Deno.test("write() JSON throws SerializationError for circular references", () => {
  const circular: Record<string, unknown> = { name: "test" };
  circular["self"] = circular; // Create circular reference

  assert.assertThrows(
    () => write(circular, "json"),
    Error,
    "Failed to serialize JSON",
  );
});

// CSV Format Tests
Deno.test("write() CSV with primitive array", () => {
  const primitiveArray = [1, 2, 3];
  const result = write(primitiveArray, "csv");
  assert.assertStringIncludes(result, "index,value");
  assert.assertStringIncludes(result, "0,1");
  assert.assertStringIncludes(result, "1,2");
  assert.assertStringIncludes(result, "2,3");
});

Deno.test("write() CSV with single object", () => {
  const singleObj = { name: "app", version: "1.0" };
  const result = write(singleObj, "csv");
  assert.assertStringIncludes(result, "name,version");
  assert.assertStringIncludes(result, "app,1.0");
});

Deno.test("write() CSV with primitive value", () => {
  const primitive = "hello";
  const result = write(primitive, "csv");
  assert.assertStringIncludes(result, "value");
  assert.assertStringIncludes(result, "hello");
});

Deno.test("write() CSV with custom delimiter", () => {
  const data = [{ name: "app", version: "1.0" }];
  const result = write(data, "csv", { delimiter: ";" });
  assert.assertStringIncludes(result, "name;version");
  assert.assertStringIncludes(result, "app;1.0");
});

Deno.test("write() CSV with custom headers", () => {
  const data = [{ name: "app", version: "1.0", extra: "ignored" }];
  const result = write(data, "csv", { headers: ["name", "version"] });
  assert.assertStringIncludes(result, "name,version");
  assert.assertNotMatch(result, /extra/);
});

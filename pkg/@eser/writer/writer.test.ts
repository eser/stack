// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { write } from "./writer.ts";
import { registerFormat } from "./format-registry.ts";
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
  assertEquals(parsed.name, "test-app");
  assertEquals(parsed.config.replicas, 3);
});

Deno.test("write() should serialize JSON with pretty formatting", () => {
  const result = write(testData, "json", { pretty: true });
  assertStringIncludes(result, "\n");
  assertStringIncludes(result, "  ");
});

Deno.test("write() should serialize YAML format", () => {
  const result = write(testData, "yaml");
  assertStringIncludes(result, "name: test-app");
  assertStringIncludes(result, "version: 1.0.0");
  assertStringIncludes(result, "replicas: 3");
});

Deno.test("write() should serialize YAML array with separator", () => {
  const result = write(testArray, "yaml", { separator: "---" });
  assertStringIncludes(result, "name: app1");
  assertStringIncludes(result, "---");
  assertStringIncludes(result, "name: app2");
});

Deno.test("write() should serialize CSV format", () => {
  const csvData = [
    { name: "app1", version: "1.0.0", replicas: 3 },
    { name: "app2", version: "2.0.0", replicas: 2 },
  ];

  const result = write(csvData, "csv");
  assertStringIncludes(result, "name,version,replicas");
  assertStringIncludes(result, "app1,1.0.0,3");
  assertStringIncludes(result, "app2,2.0.0,2");
});

Deno.test("write() should serialize TOML format", () => {
  const result = write(testData, "toml");
  assertStringIncludes(result, '"test-app"');
  assertStringIncludes(result, '"1.0.0"');
  assertStringIncludes(result, "[config]");
  assertStringIncludes(result, "replicas = 3");
});

Deno.test("write() should throw FormatNotFoundError for unknown format", () => {
  assertThrows(
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
  assertEquals(result, `CUSTOM: ${JSON.stringify(testData)}`);
});

Deno.test("write() should handle TOML validation errors", () => {
  assertThrows(
    () => write(["array", "not", "allowed"], "toml"),
    Error,
    "TOML format requires the root value to be an object",
  );
});

Deno.test("write() should handle empty data gracefully", () => {
  const jsonResult = write(null, "json");
  assertEquals(jsonResult, "null");

  const yamlResult = write(null, "yaml");
  assertStringIncludes(yamlResult, "null");

  const csvResult = write([], "csv");
  assertEquals(csvResult, "");
});

Deno.test("write() should handle nested objects in CSV", () => {
  const complexData = [
    { name: "app1", config: { replicas: 3 } },
    { name: "app2", config: { replicas: 2 } },
  ];

  const result = write(complexData, "csv");
  // CSV will stringify nested objects
  assertStringIncludes(result, "name,config");
});

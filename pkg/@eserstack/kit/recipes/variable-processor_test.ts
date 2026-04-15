// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import {
  hasVariables,
  MissingVariableError,
  resolveVariables,
  substituteVariables,
} from "./variable-processor.ts";
import type { TemplateVariable } from "./registry-schema.ts";

// =============================================================================
// resolveVariables
// =============================================================================

Deno.test("resolveVariables — override takes priority over default", () => {
  const defs: TemplateVariable[] = [
    { name: "name", description: "Project name", default: "default-name" },
  ];

  const result = resolveVariables(defs, { name: "my-app" });

  assert.assertEquals(result["name"], "my-app");
});

Deno.test("resolveVariables — falls back to default", () => {
  const defs: TemplateVariable[] = [
    { name: "name", description: "Project name", default: "default-name" },
  ];

  const result = resolveVariables(defs, {});

  assert.assertEquals(result["name"], "default-name");
});

Deno.test("resolveVariables — throws on missing required variable", () => {
  const defs: TemplateVariable[] = [
    { name: "name", description: "Project name" },
  ];

  assert.assertThrows(
    () => resolveVariables(defs, {}),
    MissingVariableError,
    "name",
  );
});

Deno.test("resolveVariables — resolves multiple variables", () => {
  const defs: TemplateVariable[] = [
    { name: "name", description: "Name" },
    { name: "version", description: "Version", default: "0.1.0" },
    { name: "author", description: "Author", default: "unknown" },
  ];

  const result = resolveVariables(defs, { name: "my-app", author: "eser" });

  assert.assertEquals(result["name"], "my-app");
  assert.assertEquals(result["version"], "0.1.0");
  assert.assertEquals(result["author"], "eser");
});

Deno.test("resolveVariables — empty definitions returns empty", () => {
  const result = resolveVariables([], { extra: "ignored" });

  assert.assertEquals(Object.keys(result).length, 0);
});

// =============================================================================
// substituteVariables
// =============================================================================

Deno.test("substituteVariables — replaces {{.name}} pattern", () => {
  const result = substituteVariables("Hello, {{.name}}!", { name: "World" });

  assert.assertEquals(result, "Hello, World!");
});

Deno.test("substituteVariables — handles whitespace in template", () => {
  const result = substituteVariables("Hello, {{ .name }}!", { name: "World" });

  assert.assertEquals(result, "Hello, World!");
});

Deno.test("substituteVariables — replaces multiple occurrences", () => {
  const result = substituteVariables(
    "{{.name}} by {{.author}} ({{.name}})",
    { name: "my-app", author: "eser" },
  );

  assert.assertEquals(result, "my-app by eser (my-app)");
});

Deno.test("substituteVariables — leaves unresolved variables as-is", () => {
  const result = substituteVariables(
    "{{.name}} - {{.unknown}}",
    { name: "my-app" },
  );

  assert.assertEquals(result, "my-app - {{.unknown}}");
});

Deno.test("substituteVariables — no variables in content returns unchanged", () => {
  const content = "plain text without any templates";
  const result = substituteVariables(content, { name: "ignored" });

  assert.assertEquals(result, content);
});

Deno.test("substituteVariables — empty variables map leaves templates as-is", () => {
  const content = "Hello, {{.name}}!";
  const result = substituteVariables(content, {});

  assert.assertEquals(result, content);
});

Deno.test("substituteVariables — handles multiline content", () => {
  const content = `{
  "name": "{{.project_name}}",
  "version": "{{.version}}"
}`;

  const result = substituteVariables(content, {
    project_name: "my-lib",
    version: "1.0.0",
  });

  assert.assertStringIncludes(result, '"my-lib"');
  assert.assertStringIncludes(result, '"1.0.0"');
});

// =============================================================================
// hasVariables
// =============================================================================

Deno.test("hasVariables — true for content with variables", () => {
  assert.assertEquals(hasVariables("{{.name}}"), true);
  assert.assertEquals(hasVariables("hello {{ .name }} world"), true);
});

Deno.test("hasVariables — false for plain content", () => {
  assert.assertEquals(hasVariables("no templates here"), false);
  assert.assertEquals(hasVariables("{{ not a var }}"), false);
  assert.assertEquals(hasVariables("{{noperiod}}"), false);
});

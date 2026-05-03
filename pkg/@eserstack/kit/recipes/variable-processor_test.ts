// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  hasVariables,
  MissingVariableError,
  promptVariable,
  resolveVariables,
  substituteVariables,
  validateVariable,
} from "./variable-processor.ts";
import type { TemplateVariable } from "./registry-schema.ts";

// =============================================================================
// validateVariable
// =============================================================================

describe("validateVariable", () => {
  it("returns ok when no pattern set", () => {
    const result = validateVariable({ name: "x" }, "anything");
    assert.assertEquals(result.ok, true);
  });

  it("returns ok when value matches pattern", () => {
    const result = validateVariable({ name: "x", pattern: "^[a-z]+$" }, "foo");
    assert.assertEquals(result.ok, true);
  });

  it("returns fail with reason when value does not match pattern", () => {
    const result = validateVariable(
      { name: "x", pattern: "^[a-z]+$" },
      "FOO",
    );
    assert.assertEquals(result.ok, false);
    if (!result.ok) {
      assert.assertStringIncludes(result.reason, "^[a-z]+$");
    }
  });
});

// =============================================================================
// promptVariable
// =============================================================================

describe("promptVariable", () => {
  it("returns value entered by user", async () => {
    const original = globalThis.prompt;
    globalThis.prompt = (_msg?: string) => "my-value";
    try {
      const result = await promptVariable({ name: "x" });
      assert.assertEquals(result, "my-value");
    } finally {
      globalThis.prompt = original;
    }
  });

  it("falls back to default when empty input", async () => {
    const original = globalThis.prompt;
    globalThis.prompt = (_msg?: string) => "";
    try {
      const result = await promptVariable({ name: "x", default: "fallback" });
      assert.assertEquals(result, "fallback");
    } finally {
      globalThis.prompt = original;
    }
  });

  it("retries on validation failure, succeeds on second try", async () => {
    const original = globalThis.prompt;
    let calls = 0;
    globalThis.prompt = (_msg?: string) => {
      calls++;
      return calls === 1 ? "BAD" : "good"; // first call fails pattern, second passes
    };
    try {
      const result = await promptVariable({
        name: "x",
        pattern: "^[a-z]+$",
      });
      assert.assertEquals(result, "good");
      assert.assertEquals(calls, 2);
    } finally {
      globalThis.prompt = original;
    }
  });
});

// =============================================================================
// resolveVariables
// =============================================================================

describe("resolveVariables", () => {
  it("override takes priority over default", async () => {
    const defs: TemplateVariable[] = [
      { name: "name", description: "Project name", default: "default-name" },
    ];

    const result = await resolveVariables(defs, { name: "my-app" });

    assert.assertEquals(result["name"], "my-app");
  });

  it("falls back to default", async () => {
    const defs: TemplateVariable[] = [
      { name: "name", description: "Project name", default: "default-name" },
    ];

    const result = await resolveVariables(defs, {});

    assert.assertEquals(result["name"], "default-name");
  });

  it("throws on missing required variable (non-interactive)", async () => {
    const defs: TemplateVariable[] = [
      { name: "name", description: "Project name" },
    ];

    await assert.assertRejects(
      () => resolveVariables(defs, {}),
      MissingVariableError,
      "name",
    );
  });

  it("resolves multiple variables", async () => {
    const defs: TemplateVariable[] = [
      { name: "name", description: "Name" },
      { name: "version", description: "Version", default: "0.1.0" },
      { name: "author", description: "Author", default: "unknown" },
    ];

    const result = await resolveVariables(
      defs,
      { name: "my-app", author: "eser" },
    );

    assert.assertEquals(result["name"], "my-app");
    assert.assertEquals(result["version"], "0.1.0");
    assert.assertEquals(result["author"], "eser");
  });

  it("empty definitions returns empty", async () => {
    const result = await resolveVariables([], { extra: "ignored" });

    assert.assertEquals(Object.keys(result).length, 0);
  });

  it("validates overridden value against pattern", async () => {
    const defs: TemplateVariable[] = [
      { name: "tag", pattern: "^v\\d+$" },
    ];

    await assert.assertRejects(
      () => resolveVariables(defs, { tag: "not-a-version" }),
      Error,
      "tag",
    );
  });

  it("interactive: true prompts for missing variable", async () => {
    const original = globalThis.prompt;
    globalThis.prompt = (_msg?: string) => "prompted-value";
    try {
      const defs: TemplateVariable[] = [{ name: "name" }];
      const result = await resolveVariables(defs, {}, { interactive: true });
      assert.assertEquals(result["name"], "prompted-value");
    } finally {
      globalThis.prompt = original;
    }
  });

  it("interactive: false throws instead of prompting", async () => {
    const defs: TemplateVariable[] = [{ name: "name" }];

    await assert.assertRejects(
      () => resolveVariables(defs, {}, { interactive: false }),
      MissingVariableError,
    );
  });
});

// =============================================================================
// substituteVariables
// =============================================================================

describe("substituteVariables", () => {
  it("replaces {{.name}} pattern", () => {
    const result = substituteVariables("Hello, {{.name}}!", { name: "World" });
    assert.assertEquals(result, "Hello, World!");
  });

  it("handles whitespace in template", () => {
    const result = substituteVariables("Hello, {{ .name }}!", { name: "World" });
    assert.assertEquals(result, "Hello, World!");
  });

  it("replaces multiple occurrences", () => {
    const result = substituteVariables(
      "{{.name}} by {{.author}} ({{.name}})",
      { name: "my-app", author: "eser" },
    );
    assert.assertEquals(result, "my-app by eser (my-app)");
  });

  it("leaves unresolved variables as-is", () => {
    const result = substituteVariables(
      "{{.name}} - {{.unknown}}",
      { name: "my-app" },
    );
    assert.assertEquals(result, "my-app - {{.unknown}}");
  });

  it("no variables in content returns unchanged", () => {
    const content = "plain text without any templates";
    const result = substituteVariables(content, { name: "ignored" });
    assert.assertEquals(result, content);
  });

  it("empty variables map leaves templates as-is", () => {
    const content = "Hello, {{.name}}!";
    const result = substituteVariables(content, {});
    assert.assertEquals(result, content);
  });

  it("handles multiline content", () => {
    const content = `{\n  "name": "{{.project_name}}",\n  "version": "{{.version}}"\n}`;
    const result = substituteVariables(content, {
      project_name: "my-lib",
      version: "1.0.0",
    });
    assert.assertStringIncludes(result, '"my-lib"');
    assert.assertStringIncludes(result, '"1.0.0"');
  });
});

// =============================================================================
// hasVariables
// =============================================================================

describe("hasVariables", () => {
  it("true for content with variables", () => {
    assert.assertEquals(hasVariables("{{.name}}"), true);
    assert.assertEquals(hasVariables("hello {{ .name }} world"), true);
  });

  it("false for plain content", () => {
    assert.assertEquals(hasVariables("no templates here"), false);
    assert.assertEquals(hasVariables("{{ not a var }}"), false);
    assert.assertEquals(hasVariables("{{noperiod}}"), false);
  });
});

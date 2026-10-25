// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as bdd from "@std/testing/bdd";
import * as variableProcessor from "./variable-processor.ts";
import type { TemplateVariable } from "./registry-schema.ts";

// =============================================================================
// validateVariable
// =============================================================================

bdd.describe("validateVariable", () => {
  bdd.it("returns ok when no pattern set", () => {
    const result = variableProcessor.validateVariable(
      { name: "x" },
      "anything",
    );
    assert.assertEquals(result.ok, true);
  });

  bdd.it("returns ok when value matches pattern", () => {
    const result = variableProcessor.validateVariable(
      {
        name: "x",
        pattern: "^[a-z]+$",
      },
      "foo",
    );
    assert.assertEquals(result.ok, true);
  });

  bdd.it("returns fail with reason when value does not match pattern", () => {
    const result = variableProcessor.validateVariable(
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

bdd.describe("promptVariable", () => {
  bdd.it("returns value entered by user", async () => {
    const original = globalThis.prompt;
    globalThis.prompt = (_msg?: string) => "my-value";
    try {
      const result = await variableProcessor.promptVariable({ name: "x" });
      assert.assertEquals(result, "my-value");
    } finally {
      globalThis.prompt = original;
    }
  });

  bdd.it("falls back to default when empty input", async () => {
    const original = globalThis.prompt;
    globalThis.prompt = (_msg?: string) => "";
    try {
      const result = await variableProcessor.promptVariable({
        name: "x",
        default: "fallback",
      });
      assert.assertEquals(result, "fallback");
    } finally {
      globalThis.prompt = original;
    }
  });

  bdd.it("throws MissingVariableError when the prompt gets no answer", () => {
    const original = globalThis.prompt;
    let calls = 0;
    globalThis.prompt = (_msg?: string) => {
      calls++;
      return null; // what prompt() answers when stdin is not a terminal
    };
    try {
      assert.assertThrows(
        () => variableProcessor.promptVariable({ name: "x" }),
        variableProcessor.MissingVariableError,
        "'x'",
      );
      assert.assertEquals(calls, 1);
    } finally {
      globalThis.prompt = original;
    }
  });

  bdd.it("takes the default when the prompt gets no answer", () => {
    const original = globalThis.prompt;
    globalThis.prompt = (_msg?: string) => null;
    try {
      const result = variableProcessor.promptVariable({
        name: "x",
        default: "fallback",
      });
      assert.assertEquals(result, "fallback");
    } finally {
      globalThis.prompt = original;
    }
  });

  bdd.it("retries on validation failure, succeeds on second try", async () => {
    const original = globalThis.prompt;
    let calls = 0;
    globalThis.prompt = (_msg?: string) => {
      calls++;
      return calls === 1 ? "BAD" : "good"; // first call fails pattern, second passes
    };
    try {
      const result = await variableProcessor.promptVariable({
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

bdd.describe("resolveVariables", () => {
  bdd.it("override takes priority over default", async () => {
    const defs: TemplateVariable[] = [
      { name: "name", description: "Project name", default: "default-name" },
    ];

    const result = await variableProcessor.resolveVariables(defs, {
      name: "my-app",
    });

    assert.assertEquals(result["name"], "my-app");
  });

  bdd.it("falls back to default", async () => {
    const defs: TemplateVariable[] = [
      { name: "name", description: "Project name", default: "default-name" },
    ];

    const result = await variableProcessor.resolveVariables(defs, {});

    assert.assertEquals(result["name"], "default-name");
  });

  bdd.it("throws on missing required variable (non-interactive)", async () => {
    const defs: TemplateVariable[] = [
      { name: "name", description: "Project name" },
    ];

    await assert.assertRejects(
      () => variableProcessor.resolveVariables(defs, {}),
      variableProcessor.MissingVariableError,
      "name",
    );
  });

  bdd.it("resolves multiple variables", async () => {
    const defs: TemplateVariable[] = [
      { name: "name", description: "Name" },
      { name: "version", description: "Version", default: "0.1.0" },
      { name: "author", description: "Author", default: "unknown" },
    ];

    const result = await variableProcessor.resolveVariables(defs, {
      name: "my-app",
      author: "eser",
    });

    assert.assertEquals(result["name"], "my-app");
    assert.assertEquals(result["version"], "0.1.0");
    assert.assertEquals(result["author"], "eser");
  });

  bdd.it("empty definitions returns empty", async () => {
    const result = await variableProcessor.resolveVariables([], {
      extra: "ignored",
    });

    assert.assertEquals(Object.keys(result).length, 0);
  });

  bdd.it("validates overridden value against pattern", async () => {
    const defs: TemplateVariable[] = [{ name: "tag", pattern: "^v\\d+$" }];

    await assert.assertRejects(
      () => variableProcessor.resolveVariables(defs, { tag: "not-a-version" }),
      Error,
      "tag",
    );
  });

  bdd.it("interactive: true prompts for missing variable", async () => {
    const original = globalThis.prompt;
    globalThis.prompt = (_msg?: string) => "prompted-value";
    try {
      const defs: TemplateVariable[] = [{ name: "name" }];
      const result = await variableProcessor.resolveVariables(
        defs,
        {},
        {
          interactive: true,
        },
      );
      assert.assertEquals(result["name"], "prompted-value");
    } finally {
      globalThis.prompt = original;
    }
  });

  bdd.it("interactive: false throws instead of prompting", async () => {
    const defs: TemplateVariable[] = [{ name: "name" }];

    await assert.assertRejects(
      () =>
        variableProcessor.resolveVariables(defs, {}, { interactive: false }),
      variableProcessor.MissingVariableError,
    );
  });
});

// =============================================================================
// substituteVariables
// =============================================================================

bdd.describe("substituteVariables", () => {
  bdd.it("replaces {{.name}} pattern", () => {
    const result = variableProcessor.substituteVariables("Hello, {{.name}}!", {
      name: "World",
    });
    assert.assertEquals(result, "Hello, World!");
  });

  bdd.it("handles whitespace in template", () => {
    const result = variableProcessor.substituteVariables(
      "Hello, {{ .name }}!",
      {
        name: "World",
      },
    );
    assert.assertEquals(result, "Hello, World!");
  });

  bdd.it("replaces multiple occurrences", () => {
    const result = variableProcessor.substituteVariables(
      "{{.name}} by {{.author}} ({{.name}})",
      { name: "my-app", author: "eser" },
    );
    assert.assertEquals(result, "my-app by eser (my-app)");
  });

  bdd.it("leaves unresolved variables as-is", () => {
    const result = variableProcessor.substituteVariables(
      "{{.name}} - {{.unknown}}",
      { name: "my-app" },
    );
    assert.assertEquals(result, "my-app - {{.unknown}}");
  });

  bdd.it("no variables in content returns unchanged", () => {
    const content = "plain text without any templates";
    const result = variableProcessor.substituteVariables(content, {
      name: "ignored",
    });
    assert.assertEquals(result, content);
  });

  bdd.it("empty variables map leaves templates as-is", () => {
    const content = "Hello, {{.name}}!";
    const result = variableProcessor.substituteVariables(content, {});
    assert.assertEquals(result, content);
  });

  bdd.it("handles multiline content", () => {
    const content = `{\n  "name": "{{.project_name}}",\n  "version": "{{.version}}"\n}`;
    const result = variableProcessor.substituteVariables(content, {
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

bdd.describe("hasVariables", () => {
  bdd.it("true for content with variables", () => {
    assert.assertEquals(variableProcessor.hasVariables("{{.name}}"), true);
    assert.assertEquals(
      variableProcessor.hasVariables("hello {{ .name }} world"),
      true,
    );
  });

  bdd.it("false for plain content", () => {
    assert.assertEquals(
      variableProcessor.hasVariables("no templates here"),
      false,
    );
    assert.assertEquals(
      variableProcessor.hasVariables("{{ not a var }}"),
      false,
    );
    assert.assertEquals(variableProcessor.hasVariables("{{noperiod}}"), false);
  });
});

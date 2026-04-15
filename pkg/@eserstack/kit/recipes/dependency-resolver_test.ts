// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as dependencyResolver from "./dependency-resolver.ts";

// =============================================================================
// detectProjectType
// =============================================================================

Deno.test("detectProjectType — detects go.mod", async () => {
  const tmpDir = await runtime.fs.makeTempDir();

  try {
    await runtime.fs.writeTextFile(
      `${tmpDir}/go.mod`,
      "module example.com/test",
    );
    const result = await dependencyResolver.detectProjectType(tmpDir);

    assert.assertEquals(result.type, "go");
    assert.assertEquals(result.configFile, "go.mod");
  } finally {
    await runtime.fs.remove(tmpDir, { recursive: true });
  }
});

Deno.test("detectProjectType — detects deno.json", async () => {
  const tmpDir = await runtime.fs.makeTempDir();

  try {
    await runtime.fs.writeTextFile(`${tmpDir}/deno.json`, "{}");
    const result = await dependencyResolver.detectProjectType(tmpDir);

    assert.assertEquals(result.type, "deno");
    assert.assertEquals(result.configFile, "deno.json");
  } finally {
    await runtime.fs.remove(tmpDir, { recursive: true });
  }
});

Deno.test("detectProjectType — detects deno.jsonc", async () => {
  const tmpDir = await runtime.fs.makeTempDir();

  try {
    await runtime.fs.writeTextFile(`${tmpDir}/deno.jsonc`, "{}");
    const result = await dependencyResolver.detectProjectType(tmpDir);

    assert.assertEquals(result.type, "deno");
    assert.assertEquals(result.configFile, "deno.jsonc");
  } finally {
    await runtime.fs.remove(tmpDir, { recursive: true });
  }
});

Deno.test("detectProjectType — detects package.json", async () => {
  const tmpDir = await runtime.fs.makeTempDir();

  try {
    await runtime.fs.writeTextFile(`${tmpDir}/package.json`, "{}");
    const result = await dependencyResolver.detectProjectType(tmpDir);

    assert.assertEquals(result.type, "node");
    assert.assertEquals(result.configFile, "package.json");
  } finally {
    await runtime.fs.remove(tmpDir, { recursive: true });
  }
});

Deno.test("detectProjectType — returns unknown for empty dir", async () => {
  const tmpDir = await runtime.fs.makeTempDir();

  try {
    const result = await dependencyResolver.detectProjectType(tmpDir);

    assert.assertEquals(result.type, "unknown");
    assert.assertEquals(result.configFile, undefined);
  } finally {
    await runtime.fs.remove(tmpDir, { recursive: true });
  }
});

// =============================================================================
// getDependencyInstructions
// =============================================================================

Deno.test("getDependencyInstructions — generates go get instructions", () => {
  const recipe = {
    name: "test",
    description: "Test",
    language: "go",
    scale: "structure" as const,
    files: [{ source: "a", target: "b" }],
    dependencies: { go: ["github.com/example/pkg@latest"] },
  };

  const result = dependencyResolver.getDependencyInstructions(recipe, {
    type: "go",
    configFile: "go.mod",
  });

  assert.assertEquals(result.instructions.length, 1);
  assert.assertStringIncludes(result.instructions[0]!, "go get");
  assert.assertEquals(result.warnings.length, 0);
});

Deno.test("getDependencyInstructions — generates deno add instructions", () => {
  const recipe = {
    name: "test",
    description: "Test",
    language: "typescript",
    scale: "utility" as const,
    files: [{ source: "a", target: "b" }],
    dependencies: { jsr: ["jsr:@eserstack/fp@^4.1.0"] },
  };

  const result = dependencyResolver.getDependencyInstructions(recipe, {
    type: "deno",
    configFile: "deno.json",
  });

  assert.assertEquals(result.instructions.length, 1);
  assert.assertStringIncludes(result.instructions[0]!, "deno add");
  assert.assertEquals(result.warnings.length, 0);
});

Deno.test("getDependencyInstructions — returns empty for no deps", () => {
  const recipe = {
    name: "test",
    description: "Test",
    language: "typescript",
    scale: "utility" as const,
    files: [{ source: "a", target: "b" }],
  };

  const result = dependencyResolver.getDependencyInstructions(recipe, {
    type: "deno",
    configFile: "deno.json",
  });

  assert.assertEquals(result.instructions.length, 0);
  assert.assertEquals(result.warnings.length, 0);
});

Deno.test("getDependencyInstructions — warns on language mismatch", () => {
  const recipe = {
    name: "go-recipe",
    description: "Go recipe",
    language: "go",
    scale: "structure" as const,
    files: [{ source: "a", target: "b" }],
    dependencies: { go: ["github.com/example/pkg"] },
  };

  const result = dependencyResolver.getDependencyInstructions(recipe, {
    type: "deno",
    configFile: "deno.json",
  });

  assert.assertEquals(result.warnings.length, 1);
  assert.assertStringIncludes(result.warnings[0]!, "go");
  assert.assertStringIncludes(result.warnings[0]!, "deno");
});

Deno.test("getDependencyInstructions — no warning for unknown project type", () => {
  const recipe = {
    name: "test",
    description: "Test",
    language: "typescript",
    scale: "utility" as const,
    files: [{ source: "a", target: "b" }],
    dependencies: { jsr: ["jsr:@eserstack/fp@^4.1.0"] },
  };

  const result = dependencyResolver.getDependencyInstructions(recipe, {
    type: "unknown",
    configFile: undefined,
  });

  assert.assertEquals(result.warnings.length, 0);
});

// =============================================================================
// installDependencies
// =============================================================================

Deno.test("installDependencies — dry-run returns commands without executing", async () => {
  const tmpDir = await runtime.fs.makeTempDir();

  try {
    const installResults = await dependencyResolver.installDependencies(
      ["echo hello", "echo world"],
      tmpDir,
      { dryRun: true },
    );

    assert.assertEquals(installResults.length, 2);
    assert.assertEquals(installResults[0]!.success, true);
    assert.assertEquals(installResults[0]!.command, "echo hello");
    assert.assertEquals(installResults[1]!.success, true);
  } finally {
    await runtime.fs.remove(tmpDir, { recursive: true });
  }
});

Deno.test("installDependencies — executes commands successfully", async () => {
  const tmpDir = await runtime.fs.makeTempDir();

  try {
    const installResults = await dependencyResolver.installDependencies(
      ["echo test_output"],
      tmpDir,
    );

    assert.assertEquals(installResults.length, 1);
    assert.assertEquals(installResults[0]!.success, true);
    assert.assertEquals(installResults[0]!.command, "echo test_output");
  } finally {
    await runtime.fs.remove(tmpDir, { recursive: true });
  }
});

Deno.test("installDependencies — stops on first failure", async () => {
  const tmpDir = await runtime.fs.makeTempDir();

  try {
    const installResults = await dependencyResolver.installDependencies(
      ["false", "echo should_not_run"],
      tmpDir,
    );

    assert.assertEquals(installResults.length, 1);
    assert.assertEquals(installResults[0]!.success, false);
  } finally {
    await runtime.fs.remove(tmpDir, { recursive: true });
  }
});

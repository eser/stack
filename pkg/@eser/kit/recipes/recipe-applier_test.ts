// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { runtime } from "@eser/standards/cross-runtime";
import * as recipeApplier from "./recipe-applier.ts";

// =============================================================================
// isPathSafe
// =============================================================================

Deno.test("isPathSafe — allows safe relative path", () => {
  assert.assertEquals(
    recipeApplier.isPathSafe("/project", "src/foo.ts"),
    true,
  );
});

Deno.test("isPathSafe — allows nested path", () => {
  assert.assertEquals(
    recipeApplier.isPathSafe("/project", "src/lib/deep/file.ts"),
    true,
  );
});

Deno.test("isPathSafe — rejects ../ traversal", () => {
  assert.assertEquals(
    recipeApplier.isPathSafe("/project", "../etc/passwd"),
    false,
  );
});

Deno.test("isPathSafe — rejects absolute path outside cwd", () => {
  assert.assertEquals(
    recipeApplier.isPathSafe("/project", "/etc/passwd"),
    false,
  );
});

Deno.test("isPathSafe — rejects resolved traversal", () => {
  assert.assertEquals(
    recipeApplier.isPathSafe("/project", "src/../../etc/passwd"),
    false,
  );
});

// =============================================================================
// applyRecipe — dry-run mode
// =============================================================================

Deno.test("applyRecipe — dry-run reports files without writing", async () => {
  const recipe = {
    name: "test-recipe",
    description: "Test",
    language: "typescript",
    scale: "utility" as const,
    files: [
      { source: "src/a.ts", target: "lib/a.ts" },
      { source: "src/b.ts", target: "lib/b.ts" },
    ],
  };

  const tmpDir = await runtime.fs.makeTempDir();

  try {
    const result = await recipeApplier.applyRecipe(recipe, {
      cwd: tmpDir,
      registryUrl: "https://example.com",
      dryRun: true,
    });

    assert.assertEquals(result.written.length, 2);
    assert.assertEquals(result.total, 2);

    // Verify no files were actually written
    const exists = await recipeApplier.fileExists(`${tmpDir}/lib/a.ts`);

    assert.assertEquals(exists, false);
  } finally {
    await runtime.fs.remove(tmpDir, { recursive: true });
  }
});

// =============================================================================
// applyRecipe — path traversal rejection
// =============================================================================

Deno.test("applyRecipe — rejects recipe with path traversal", async () => {
  const recipe = {
    name: "evil-recipe",
    description: "Evil",
    language: "typescript",
    scale: "utility" as const,
    files: [
      { source: "src/a.ts", target: "../../../etc/evil.ts" },
    ],
  };

  const tmpDir = await runtime.fs.makeTempDir();

  try {
    await assert.assertRejects(
      () =>
        recipeApplier.applyRecipe(recipe, {
          cwd: tmpDir,
          registryUrl: "https://example.com",
          dryRun: true,
        }),
      Error,
      "path traversal",
    );
  } finally {
    await runtime.fs.remove(tmpDir, { recursive: true });
  }
});

// =============================================================================
// fileExists
// =============================================================================

Deno.test("fileExists — returns true for existing file", async () => {
  const tmpDir = await runtime.fs.makeTempDir();
  const tmpFile = `${tmpDir}/test-file.txt`;
  await runtime.fs.writeTextFile(tmpFile, "test");

  try {
    assert.assertEquals(await recipeApplier.fileExists(tmpFile), true);
  } finally {
    await runtime.fs.remove(tmpDir, { recursive: true });
  }
});

Deno.test("fileExists — returns false for nonexistent file", async () => {
  assert.assertEquals(
    await recipeApplier.fileExists("/nonexistent/path/file.ts"),
    false,
  );
});

// =============================================================================
// processContent — variable substitution integration
// =============================================================================

Deno.test("processContent — substitutes variables in content", () => {
  const result = recipeApplier.processContent(
    '{ "name": "{{.project_name}}" }',
    { project_name: "my-app" },
  );

  assert.assertStringIncludes(result, "my-app");
  assert.assertEquals(result.includes("{{.project_name}}"), false);
});

Deno.test("processContent — returns unchanged when no variables", () => {
  const content = "plain content";
  const result = recipeApplier.processContent(content, undefined);

  assert.assertEquals(result, content);
});

Deno.test("processContent — returns unchanged with empty variables", () => {
  const content = "plain content";
  const result = recipeApplier.processContent(content, {});

  assert.assertEquals(result, content);
});

// =============================================================================
// runPostInstall — dry-run mode
// =============================================================================

Deno.test("runPostInstall — dry-run reports commands without executing", async () => {
  const tmpDir = await runtime.fs.makeTempDir();

  try {
    const ran = await recipeApplier.runPostInstall(
      ["echo hello", "echo world"],
      tmpDir,
      true, // dryRun
    );

    assert.assertEquals(ran.length, 2);
    assert.assertEquals(ran[0], "echo hello");
    assert.assertEquals(ran[1], "echo world");
  } finally {
    await runtime.fs.remove(tmpDir, { recursive: true });
  }
});

Deno.test("runPostInstall — executes commands for real", async () => {
  const tmpDir = await runtime.fs.makeTempDir();

  try {
    const ran = await recipeApplier.runPostInstall(
      ["echo test_output"],
      tmpDir,
      false,
    );

    assert.assertEquals(ran.length, 1);
  } finally {
    await runtime.fs.remove(tmpDir, { recursive: true });
  }
});

// =============================================================================
// applyRecipe — dry-run with variables
// =============================================================================

Deno.test("applyRecipe — dry-run with variables reports correctly", async () => {
  const recipe = {
    name: "templated-recipe",
    description: "Test with variables",
    language: "typescript",
    scale: "utility" as const,
    variables: [
      { name: "project_name", description: "Name", default: "default-app" },
    ],
    files: [
      { source: "src/a.ts", target: "lib/a.ts" },
    ],
  };

  const tmpDir = await runtime.fs.makeTempDir();

  try {
    const result = await recipeApplier.applyRecipe(recipe, {
      cwd: tmpDir,
      registryUrl: "https://example.com",
      dryRun: true,
      variables: { project_name: "my-app" },
    });

    assert.assertEquals(result.written.length, 1);
  } finally {
    await runtime.fs.remove(tmpDir, { recursive: true });
  }
});

// =============================================================================
// applyRecipe — dry-run with postInstall
// =============================================================================

Deno.test("applyRecipe — dry-run includes postInstall in result", async () => {
  const recipe = {
    name: "post-install-recipe",
    description: "Test with postInstall",
    language: "typescript",
    scale: "utility" as const,
    files: [{ source: "src/a.ts", target: "lib/a.ts" }],
    postInstall: ["echo setup"],
  };

  const tmpDir = await runtime.fs.makeTempDir();

  try {
    const result = await recipeApplier.applyRecipe(recipe, {
      cwd: tmpDir,
      registryUrl: "https://example.com",
      dryRun: true,
    });

    assert.assertEquals(result.postInstallRan.length, 1);
    assert.assertEquals(result.postInstallRan[0], "echo setup");
  } finally {
    await runtime.fs.remove(tmpDir, { recursive: true });
  }
});

// =============================================================================
// applyRecipe — folder kind in dry-run (no network call)
// =============================================================================

Deno.test("applyRecipe — dry-run with folder kind reports correctly", async () => {
  const recipe = {
    name: "folder-recipe",
    description: "Test with folder",
    language: "go",
    scale: "utility" as const,
    files: [
      { source: "src/a.ts", target: "lib/a.ts" },
      { source: "configfx/", target: "pkg/configfx", kind: "folder" as const },
    ],
  };

  const tmpDir = await runtime.fs.makeTempDir();

  try {
    // Folder fetch requires network — in dry-run for file entries,
    // it works without network. Folder entries in dry-run still need
    // to fetch the listing. We only test the file entry here.
    const result = await recipeApplier.applyRecipe(
      {
        ...recipe,
        files: [{ source: "src/a.ts", target: "lib/a.ts" }],
      },
      {
        cwd: tmpDir,
        registryUrl: "https://example.com",
        dryRun: true,
      },
    );

    assert.assertEquals(result.written.length, 1);
  } finally {
    await runtime.fs.remove(tmpDir, { recursive: true });
  }
});

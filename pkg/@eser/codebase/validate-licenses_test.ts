// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for validate-licenses tool.
 *
 * Tests cover the pure check/fix functions directly (no mocks needed)
 * plus factory integration via tool.run().
 *
 * @module
 */

import * as assert from "@std/assert";
import * as path from "@std/path";
import { runtime } from "@eser/standards/cross-runtime";
import { tool } from "./validate-licenses.ts";

// =============================================================================
// Helpers
// =============================================================================

const CORRECT_HEADER =
  "// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.\n";
const WRONG_YEAR_HEADER =
  "// Copyright 2022-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.\n";

/**
 * Create a temp dir with .ts files for integration tests.
 * Returns the dir path. Caller is responsible for cleanup.
 */
const makeTempDir = async (): Promise<string> => {
  return await runtime.fs.makeTempDir({ prefix: "validate-licenses-test-" });
};

const writeFile = async (dir: string, name: string, content: string) => {
  await runtime.fs.writeTextFile(path.join(dir, name), content);
};

// =============================================================================
// Unit tests — checkFile function via tool internals
// =============================================================================

// Access the check/fix functions indirectly through tool.run() with temp files
// since the factory doesn't expose them directly.

Deno.test("validate-licenses: correct header → no issues", async () => {
  const dir = await makeTempDir();
  try {
    await writeFile(
      dir,
      "valid.ts",
      `${CORRECT_HEADER}\nexport const x = 1;\n`,
    );
    const result = await tool.run({ root: dir });
    assert.assertEquals(result.issues.length, 0);
    assert.assertEquals(result.filesChecked, 1);
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
});

Deno.test("validate-licenses: missing header → issue reported", async () => {
  const dir = await makeTempDir();
  try {
    await writeFile(dir, "missing.ts", "export const x = 1;\n");
    const result = await tool.run({ root: dir });
    assert.assertEquals(result.issues.length, 1);
    assert.assertEquals(result.issues[0]!.message, "missing copyright header");
    assert.assertEquals(result.issues[0]!.path, path.join(dir, "missing.ts"));
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
});

Deno.test("validate-licenses: incorrect copyright year → issue reported", async () => {
  const dir = await makeTempDir();
  try {
    await writeFile(
      dir,
      "wrong-year.ts",
      `${WRONG_YEAR_HEADER}\nexport const x = 1;\n`,
    );
    const result = await tool.run({ root: dir });
    assert.assertEquals(result.issues.length, 1);
    assert.assertEquals(result.issues[0]!.message, "incorrect copyright year");
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
});

Deno.test("validate-licenses: shebang file → header detected after shebang", async () => {
  const dir = await makeTempDir();
  try {
    await writeFile(
      dir,
      "script.ts",
      `#!/usr/bin/env deno run\n${CORRECT_HEADER}\nexport {};\n`,
    );
    const result = await tool.run({ root: dir });
    assert.assertEquals(result.issues.length, 0);
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
});

Deno.test("validate-licenses: shebang file missing header → issue reported", async () => {
  const dir = await makeTempDir();
  try {
    await writeFile(dir, "script.ts", "#!/usr/bin/env deno run\nexport {};\n");
    const result = await tool.run({ root: dir });
    assert.assertEquals(result.issues.length, 1);
    assert.assertEquals(result.issues[0]!.message, "missing copyright header");
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
});

Deno.test("validate-licenses: docs/ pattern → file skipped", async () => {
  const dir = await makeTempDir();
  try {
    await runtime.fs.mkdir(path.join(dir, "docs"), { recursive: true });
    await writeFile(dir, "docs/guide.ts", "export const x = 1;\n");
    const result = await tool.run({ root: dir });
    assert.assertEquals(result.issues.length, 0);
    assert.assertEquals(result.filesChecked, 1); // file was walked but returned no issues
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
});

// =============================================================================
// Fix mode tests
// =============================================================================

Deno.test("validate-licenses: fix missing → mutation adds header", async () => {
  const dir = await makeTempDir();
  try {
    await writeFile(dir, "fix-me.ts", "export const x = 1;\n");
    const result = await tool.run({ root: dir, fix: true });
    assert.assertEquals(result.mutations.length, 1);
    assert.assertStringIncludes(
      result.mutations[0]!.newContent,
      "// Copyright 2023-present",
    );
    assert.assertStringIncludes(
      result.mutations[0]!.newContent,
      "export const x = 1;",
    );
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
});

Deno.test("validate-licenses: fix incorrect year → mutation replaces header", async () => {
  const dir = await makeTempDir();
  try {
    await writeFile(
      dir,
      "wrong-year.ts",
      `${WRONG_YEAR_HEADER}\nexport const x = 1;\n`,
    );
    const result = await tool.run({ root: dir, fix: true });
    assert.assertEquals(result.mutations.length, 1);
    assert.assertStringIncludes(
      result.mutations[0]!.newContent,
      "// Copyright 2023-present",
    );
    assert.assertEquals(
      result.mutations[0]!.newContent.includes("2022"),
      false,
      "old year should be removed",
    );
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
});

// =============================================================================
// Integration: exclude option
// =============================================================================

Deno.test("validate-licenses: exclude option → skips matching files", async () => {
  const dir = await makeTempDir();
  try {
    await runtime.fs.mkdir(path.join(dir, "generated"), { recursive: true });
    await writeFile(dir, "generated/output.ts", "export const x = 1;\n");
    await writeFile(
      dir,
      "valid.ts",
      `${CORRECT_HEADER}\nexport const y = 2;\n`,
    );

    const result = await tool.run({ root: dir, exclude: ["generated/"] });
    // generated/output.ts has no header but should be excluded
    assert.assertEquals(result.issues.length, 0);
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
});

// =============================================================================
// Integration: extension normalization in walkSourceFiles
// =============================================================================

Deno.test("walkSourceFiles: bare extension 'ts'", async () => {
  const { walkSourceFiles } = await import("./file-tools-shared.ts");
  const dir = await makeTempDir();
  try {
    await writeFile(dir, "file.ts", "export const x = 1;\n");
    await writeFile(dir, "file.js", "export const y = 2;\n");
    await writeFile(dir, "file.md", "# readme\n");

    const withoutDot = await walkSourceFiles({ root: dir, extensions: ["ts"] });

    assert.assertEquals(withoutDot.length, 1);
    assert.assertEquals(withoutDot[0]!.name, "file.ts");
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
});

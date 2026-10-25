// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as tempDir from "./temp-dir.ts";

nodeTest.test("withTmpDir should create temporary directory", async () => {
  const temp = await tempDir.withTmpDir();

  try {
    assert.assertExists(temp.dir);

    // The temp dir is created under the OS temporary directory. Derive the
    // expected base with the same resolution the runtime uses (TMPDIR/TMP/TEMP
    // then os.tmpdir()) so the check is correct on Windows as well as POSIX,
    // instead of hardcoding the POSIX-only "TMPDIR" env var and "/tmp".
    // Normalize both sides (separator-agnostic) and compare case-insensitively
    // on Windows, where filesystem paths are case-insensitive.
    const expectedBase = crossRuntime.runtime.path.normalize(
      crossRuntime.getTmpdir(),
    );
    const actualDir = crossRuntime.runtime.path.normalize(temp.dir);
    if (crossRuntime.getPlatform() === "windows") {
      assert.assertStringIncludes(
        actualDir.toLowerCase(),
        expectedBase.toLowerCase(),
      );
    } else {
      assert.assertStringIncludes(actualDir, expectedBase);
    }

    // Verify directory exists
    const stat = await crossRuntime.runtime.fs.stat(temp.dir);
    assert.assertEquals(stat.isDirectory, true);
  } finally {
    await temp[Symbol.asyncDispose]();
  }
});

nodeTest.test("withTmpDir should allow file operations", async () => {
  const temp = await tempDir.withTmpDir();

  try {
    const testFile = `${temp.dir}/test.txt`;
    await crossRuntime.runtime.fs.writeTextFile(testFile, "Hello World");

    const content = await crossRuntime.runtime.fs.readTextFile(testFile);
    assert.assertEquals(content, "Hello World");
  } finally {
    await temp[Symbol.asyncDispose]();
  }
});

nodeTest.test("withTmpDir should accept options", async () => {
  const temp = await tempDir.withTmpDir({ prefix: "test-prefix-" });

  try {
    assert.assertStringIncludes(temp.dir, "test-prefix-");
  } finally {
    await temp[Symbol.asyncDispose]();
  }
});

nodeTest.test("delay should pause execution", async () => {
  const start = Date.now();
  await tempDir.delay(50);
  const elapsed = Date.now() - start;

  assert.assertEquals(elapsed >= 45, true); // Allow for timing variance
});

nodeTest.test("writeFiles should create files with directories", async () => {
  const temp = await tempDir.withTmpDir();

  try {
    await tempDir.writeFiles({
      [`${temp.dir}/a.txt`]: "content a",
      [`${temp.dir}/nested/b.txt`]: "content b",
      [`${temp.dir}/nested/deep/c.txt`]: "content c",
    });

    const a = await crossRuntime.runtime.fs.readTextFile(`${temp.dir}/a.txt`);
    assert.assertEquals(a, "content a");

    const b = await crossRuntime.runtime.fs.readTextFile(
      `${temp.dir}/nested/b.txt`,
    );
    assert.assertEquals(b, "content b");

    const c = await crossRuntime.runtime.fs.readTextFile(
      `${temp.dir}/nested/deep/c.txt`,
    );
    assert.assertEquals(c, "content c");
  } finally {
    await temp[Symbol.asyncDispose]();
  }
});

nodeTest.test("writeFiles should handle existing directories", async () => {
  const temp = await tempDir.withTmpDir();

  try {
    // Create directory first
    await crossRuntime.runtime.fs.mkdir(`${temp.dir}/existing`, {
      recursive: true,
    });

    // Write file to existing directory (should not error)
    await tempDir.writeFiles({
      [`${temp.dir}/existing/file.txt`]: "content",
    });

    const content = await crossRuntime.runtime.fs.readTextFile(
      `${temp.dir}/existing/file.txt`,
    );
    assert.assertEquals(content, "content");
  } finally {
    await temp[Symbol.asyncDispose]();
  }
});

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { runtime } from "@eser/standards/runtime";
import { delay, withTmpDir, writeFiles } from "./temp-dir.ts";

Deno.test("withTmpDir should create temporary directory", async () => {
  const temp = await withTmpDir();

  try {
    assert.assertExists(temp.dir);
    assert.assertStringIncludes(temp.dir, runtime.env.get("TMPDIR") ?? "/tmp");

    // Verify directory exists
    const stat = await runtime.fs.stat(temp.dir);
    assert.assertEquals(stat.isDirectory, true);
  } finally {
    await temp[Symbol.asyncDispose]();
  }
});

Deno.test("withTmpDir should allow file operations", async () => {
  const temp = await withTmpDir();

  try {
    const testFile = `${temp.dir}/test.txt`;
    await runtime.fs.writeTextFile(testFile, "Hello World");

    const content = await runtime.fs.readTextFile(testFile);
    assert.assertEquals(content, "Hello World");
  } finally {
    await temp[Symbol.asyncDispose]();
  }
});

Deno.test("withTmpDir should accept options", async () => {
  const temp = await withTmpDir({ prefix: "test-prefix-" });

  try {
    assert.assertStringIncludes(temp.dir, "test-prefix-");
  } finally {
    await temp[Symbol.asyncDispose]();
  }
});

Deno.test("delay should pause execution", async () => {
  const start = Date.now();
  await delay(50);
  const elapsed = Date.now() - start;

  assert.assertEquals(elapsed >= 45, true); // Allow for timing variance
});

Deno.test("writeFiles should create files with directories", async () => {
  const temp = await withTmpDir();

  try {
    await writeFiles({
      [`${temp.dir}/a.txt`]: "content a",
      [`${temp.dir}/nested/b.txt`]: "content b",
      [`${temp.dir}/nested/deep/c.txt`]: "content c",
    });

    const a = await runtime.fs.readTextFile(`${temp.dir}/a.txt`);
    assert.assertEquals(a, "content a");

    const b = await runtime.fs.readTextFile(`${temp.dir}/nested/b.txt`);
    assert.assertEquals(b, "content b");

    const c = await runtime.fs.readTextFile(`${temp.dir}/nested/deep/c.txt`);
    assert.assertEquals(c, "content c");
  } finally {
    await temp[Symbol.asyncDispose]();
  }
});

Deno.test("writeFiles should handle existing directories", async () => {
  const temp = await withTmpDir();

  try {
    // Create directory first
    await runtime.fs.mkdir(`${temp.dir}/existing`, { recursive: true });

    // Write file to existing directory (should not error)
    await writeFiles({
      [`${temp.dir}/existing/file.txt`]: "content",
    });

    const content = await runtime.fs.readTextFile(
      `${temp.dir}/existing/file.txt`,
    );
    assert.assertEquals(content, "content");
  } finally {
    await temp[Symbol.asyncDispose]();
  }
});

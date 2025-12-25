// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as standardsRuntime from "@eser/standards/runtime";
import { createCacheManager } from "./cache.ts";

const createTempCacheManager = async () => {
  const tempDir = await standardsRuntime.runtime.fs.makeTempDir({
    prefix: "cache-test-",
  });

  return {
    cache: createCacheManager({
      app: { name: "test-app", org: "test-org" },
      baseDir: tempDir,
    }),
    tempDir,
    cleanup: async () => {
      try {
        await standardsRuntime.runtime.fs.remove(tempDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    },
  };
};

Deno.test("createCacheManager returns CacheManager", () => {
  const cache = createCacheManager({
    app: { name: "test-app" },
  });

  assert.assertExists(cache.getCacheDir);
  assert.assertExists(cache.getVersionedPath);
  assert.assertExists(cache.exists);
  assert.assertExists(cache.ensureDir);
  assert.assertExists(cache.list);
  assert.assertExists(cache.remove);
  assert.assertExists(cache.clear);
});

Deno.test("getCacheDir returns valid path", () => {
  const cache = createCacheManager({
    app: { name: "test-app" },
  });

  const cacheDir = cache.getCacheDir();

  assert.assertExists(cacheDir);
  assert.assert(cacheDir.length > 0, "Cache dir should not be empty");
  assert.assert(
    cacheDir.includes("test-app"),
    "Cache dir should include app name",
  );
});

Deno.test("getCacheDir with org includes org in path", () => {
  const cache = createCacheManager({
    app: { name: "test-app", org: "test-org" },
  });

  const cacheDir = cache.getCacheDir();

  assert.assert(
    cacheDir.includes("test-org"),
    "Cache dir should include org name",
  );
  assert.assert(
    cacheDir.includes("test-app"),
    "Cache dir should include app name",
  );
});

Deno.test("getVersionedPath normalizes version", () => {
  const cache = createCacheManager({
    app: { name: "test-app" },
  });

  const path = cache.getVersionedPath("1.0.0", "binary");

  assert.assert(
    path.includes("v1.0.0"),
    "Should normalize version to have v prefix",
  );
  assert.assert(path.includes("binary"), "Should include item name");
});

Deno.test("ensureDir creates directory", async () => {
  const { cache, cleanup } = await createTempCacheManager();

  try {
    const testDir = standardsRuntime.runtime.path.join(
      cache.getCacheDir(),
      "subdir",
    );

    await cache.ensureDir(testDir);

    const dirExists = await standardsRuntime.runtime.fs.exists(testDir);
    assert.assert(dirExists, "Directory should exist after ensureDir");
  } finally {
    await cleanup();
  }
});

Deno.test("exists returns false for non-existent path", async () => {
  const { cache, cleanup } = await createTempCacheManager();

  try {
    const result = await cache.exists("non-existent-file");

    assert.assertEquals(result, false);
  } finally {
    await cleanup();
  }
});

Deno.test("exists returns true for existing path", async () => {
  const { cache, cleanup } = await createTempCacheManager();

  try {
    // Create a test file
    const testDir = cache.getCacheDir();
    await standardsRuntime.runtime.fs.mkdir(testDir, { recursive: true });

    const testFile = standardsRuntime.runtime.path.join(testDir, "test-file");
    await standardsRuntime.runtime.fs.writeTextFile(testFile, "test content");

    const result = await cache.exists("test-file");

    assert.assertEquals(result, true);
  } finally {
    await cleanup();
  }
});

Deno.test("list returns empty array for empty cache", async () => {
  const { cache, cleanup } = await createTempCacheManager();

  try {
    const entries = await cache.list();

    assert.assertExists(entries);
    assert.assertEquals(entries.length, 0);
  } finally {
    await cleanup();
  }
});

Deno.test("list returns entries for non-empty cache", async () => {
  const { cache, cleanup } = await createTempCacheManager();

  try {
    const cacheDir = cache.getCacheDir();
    await standardsRuntime.runtime.fs.mkdir(cacheDir, { recursive: true });

    // Create test files
    await standardsRuntime.runtime.fs.writeTextFile(
      standardsRuntime.runtime.path.join(cacheDir, "file1"),
      "content1",
    );
    await standardsRuntime.runtime.fs.mkdir(
      standardsRuntime.runtime.path.join(cacheDir, "dir1"),
    );

    const entries = await cache.list();

    assert.assertEquals(entries.length, 2);

    const fileEntry = entries.find((e) => e.name === "file1");
    const dirEntry = entries.find((e) => e.name === "dir1");

    assert.assertExists(fileEntry);
    assert.assertExists(dirEntry);
    assert.assertEquals(fileEntry?.isDirectory, false);
    assert.assertEquals(dirEntry?.isDirectory, true);
  } finally {
    await cleanup();
  }
});

Deno.test("remove deletes file", async () => {
  const { cache, cleanup } = await createTempCacheManager();

  try {
    const cacheDir = cache.getCacheDir();
    await standardsRuntime.runtime.fs.mkdir(cacheDir, { recursive: true });

    const testFile = standardsRuntime.runtime.path.join(cacheDir, "to-remove");
    await standardsRuntime.runtime.fs.writeTextFile(testFile, "content");

    // Verify file exists
    assert.assertEquals(await cache.exists("to-remove"), true);

    // Remove it
    await cache.remove("to-remove");

    // Verify it's gone
    assert.assertEquals(await cache.exists("to-remove"), false);
  } finally {
    await cleanup();
  }
});

Deno.test("clear removes all cache contents", async () => {
  const { cache, cleanup } = await createTempCacheManager();

  try {
    const cacheDir = cache.getCacheDir();
    await standardsRuntime.runtime.fs.mkdir(cacheDir, { recursive: true });

    // Create some files
    await standardsRuntime.runtime.fs.writeTextFile(
      standardsRuntime.runtime.path.join(cacheDir, "file1"),
      "content",
    );
    await standardsRuntime.runtime.fs.writeTextFile(
      standardsRuntime.runtime.path.join(cacheDir, "file2"),
      "content",
    );

    // Clear cache
    await cache.clear();

    // Verify cache dir is gone
    const dirExists = await standardsRuntime.runtime.fs.exists(cacheDir);
    assert.assertEquals(dirExists, false);
  } finally {
    await cleanup();
  }
});

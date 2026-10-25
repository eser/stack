// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as cache from "./cache.ts";

const createTempCacheManager = async () => {
  const tempDir = await runtime.fs.makeTempDir({
    prefix: "cache-test-",
  });

  const manager = cache.createCacheManager({
    app: { name: "test-app", org: "test-org" },
    baseDir: tempDir,
  });

  return {
    manager,
    tempDir,
    cleanup: async () => {
      try {
        await manager.close();
      } catch {
        // ignore close errors
      }
      try {
        await runtime.fs.remove(tempDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    },
  };
};

Deno.test("createCacheManager returns CacheManager", () => {
  const manager = cache.createCacheManager({
    app: { name: "test-app" },
  });

  assert.assertExists(manager.getCacheDir);
  assert.assertExists(manager.getVersionedPath);
  assert.assertExists(manager.exists);
  assert.assertExists(manager.ensureDir);
  assert.assertExists(manager.list);
  assert.assertExists(manager.remove);
  assert.assertExists(manager.clear);
  assert.assertExists(manager.close);
});

Deno.test("getCacheDir returns valid path", () => {
  const manager = cache.createCacheManager({
    app: { name: "test-app" },
  });

  const cacheDir = manager.getCacheDir();

  assert.assertExists(cacheDir);
  assert.assert(cacheDir.length > 0, "Cache dir should not be empty");
  assert.assert(
    cacheDir.includes("test-app"),
    "Cache dir should include app name",
  );
});

Deno.test("getCacheDir with org includes org in path", () => {
  const manager = cache.createCacheManager({
    app: { name: "test-app", org: "test-org" },
  });

  const cacheDir = manager.getCacheDir();

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
  const manager = cache.createCacheManager({
    app: { name: "test-app" },
  });

  const path = manager.getVersionedPath("1.0.0", "binary");

  assert.assert(
    path.includes("v1.0.0"),
    "Should normalize version to have v prefix",
  );
  assert.assert(path.includes("binary"), "Should include item name");
});

Deno.test("ensureDir creates directory", async () => {
  const { manager, cleanup } = await createTempCacheManager();

  try {
    const testDir = runtime.path.join(
      manager.getCacheDir(),
      "subdir",
    );

    await manager.ensureDir(testDir);

    const dirExists = await runtime.fs.exists(testDir);
    assert.assert(dirExists, "Directory should exist after ensureDir");
  } finally {
    await cleanup();
  }
});

Deno.test("exists returns false for non-existent path", async () => {
  const { manager, cleanup } = await createTempCacheManager();

  try {
    const result = await manager.exists("non-existent-file");

    assert.assertEquals(result, false);
  } finally {
    await cleanup();
  }
});

Deno.test("exists returns true for existing path", async () => {
  const { manager, cleanup } = await createTempCacheManager();

  try {
    // Create a test file
    const testDir = manager.getCacheDir();
    await runtime.fs.mkdir(testDir, { recursive: true });

    const testFile = runtime.path.join(testDir, "test-file");
    await runtime.fs.writeTextFile(testFile, "test content");

    const result = await manager.exists("test-file");

    assert.assertEquals(result, true);
  } finally {
    await cleanup();
  }
});

Deno.test({
  name: "list returns empty array for empty cache",
  sanitizeResources: false,
}, async () => {
  const { manager, cleanup } = await createTempCacheManager();

  try {
    const entries = await manager.list();

    assert.assertExists(entries);
    assert.assertEquals(entries.length, 0);
  } finally {
    await cleanup();
  }
});

Deno.test("list returns entries for non-empty cache", async () => {
  const { manager, cleanup } = await createTempCacheManager();

  try {
    const cacheDir = manager.getCacheDir();
    await runtime.fs.mkdir(cacheDir, { recursive: true });

    // Create test files
    await runtime.fs.writeTextFile(
      runtime.path.join(cacheDir, "file1"),
      "content1",
    );
    await runtime.fs.mkdir(
      runtime.path.join(cacheDir, "dir1"),
    );

    const entries = await manager.list();

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
  const { manager, cleanup } = await createTempCacheManager();

  try {
    const cacheDir = manager.getCacheDir();
    await runtime.fs.mkdir(cacheDir, { recursive: true });

    const testFile = runtime.path.join(cacheDir, "to-remove");
    await runtime.fs.writeTextFile(testFile, "content");

    // Verify file exists
    assert.assertEquals(await manager.exists("to-remove"), true);

    // Remove it
    await manager.remove("to-remove");

    // Verify it's gone
    assert.assertEquals(await manager.exists("to-remove"), false);
  } finally {
    await cleanup();
  }
});

Deno.test("clear removes all cache contents", async () => {
  const { manager, cleanup } = await createTempCacheManager();

  try {
    const cacheDir = manager.getCacheDir();
    await runtime.fs.mkdir(cacheDir, { recursive: true });

    // Create some files
    await runtime.fs.writeTextFile(
      runtime.path.join(cacheDir, "file1"),
      "content",
    );
    await runtime.fs.writeTextFile(
      runtime.path.join(cacheDir, "file2"),
      "content",
    );

    // Clear cache
    await manager.clear();

    // Verify cache dir is gone
    const dirExists = await runtime.fs.exists(cacheDir);
    assert.assertEquals(dirExists, false);
  } finally {
    await cleanup();
  }
});

Deno.test({
  name: "close() releases handle without error",
  sanitizeResources: false,
}, async () => {
  const { manager, tempDir } = await createTempCacheManager();

  try {
    await manager.list(); // trigger handle creation
    await manager.close(); // must not throw
  } finally {
    try {
      await runtime.fs.remove(tempDir, { recursive: true });
    } catch {
      // ignore
    }
  }
});

Deno.test(
  { name: "double-close is safe", sanitizeResources: false },
  async () => {
    const { manager, tempDir } = await createTempCacheManager();

    try {
      await manager.list(); // trigger handle creation
      await manager.close();
      await manager.close(); // second close must be a no-op
    } finally {
      try {
        await runtime.fs.remove(tempDir, { recursive: true });
      } catch {
        // ignore
      }
    }
  },
);

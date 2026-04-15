// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import {
  addChunk,
  type ChunkInfo,
  type ChunkManifest,
  createChunkManifest,
  getAllPaths,
  getChunk,
  getTotalSize,
  hasChunk,
  parseManifest,
  serializeManifest,
} from "./chunk-manifest.ts";

// ============================================================================
// createChunkManifest tests
// ============================================================================

Deno.test("createChunkManifest creates manifest with entrypoint and buildId", () => {
  const manifest = createChunkManifest("main.js", "build-123");

  assert.assertEquals(manifest.entrypoint, "main.js");
  assert.assertEquals(manifest.buildId, "build-123");
});

Deno.test("createChunkManifest creates manifest with empty chunks", () => {
  const manifest = createChunkManifest("main.js", "build-123");

  assert.assertEquals(manifest.chunks, {});
  assert.assertEquals(Object.keys(manifest.chunks).length, 0);
});

Deno.test("createChunkManifest creates manifest with timestamp", () => {
  const before = Date.now();
  const manifest = createChunkManifest("main.js", "build-123");
  const after = Date.now();

  assert.assertExists(manifest.timestamp);
  assert.assert(manifest.timestamp >= before);
  assert.assert(manifest.timestamp <= after);
});

// ============================================================================
// addChunk tests
// ============================================================================

Deno.test("addChunk adds chunk to manifest", () => {
  const manifest = createChunkManifest("main.js", "build-123");
  const chunk: ChunkInfo = { path: "chunk-abc.js", size: 1024, hash: "abc123" };

  const updated = addChunk(manifest, "vendor", chunk);

  assert.assertExists(updated.chunks["vendor"]);
  assert.assertEquals(updated.chunks["vendor"], chunk);
});

Deno.test("addChunk preserves existing chunks", () => {
  const manifest = createChunkManifest("main.js", "build-123");
  const chunk1: ChunkInfo = { path: "chunk-1.js", size: 100, hash: "hash1" };
  const chunk2: ChunkInfo = { path: "chunk-2.js", size: 200, hash: "hash2" };

  const withChunk1 = addChunk(manifest, "chunk1", chunk1);
  const withBoth = addChunk(withChunk1, "chunk2", chunk2);

  assert.assertExists(withBoth.chunks["chunk1"]);
  assert.assertExists(withBoth.chunks["chunk2"]);
  assert.assertEquals(Object.keys(withBoth.chunks).length, 2);
});

Deno.test("addChunk is immutable - does not modify original", () => {
  const manifest = createChunkManifest("main.js", "build-123");
  const chunk: ChunkInfo = { path: "chunk.js", size: 100, hash: "hash" };

  const updated = addChunk(manifest, "new-chunk", chunk);

  assert.assertEquals(Object.keys(manifest.chunks).length, 0);
  assert.assertEquals(Object.keys(updated.chunks).length, 1);
});

Deno.test("addChunk overrides chunk with same name", () => {
  const manifest = createChunkManifest("main.js", "build-123");
  const chunk1: ChunkInfo = { path: "old.js", size: 100, hash: "old" };
  const chunk2: ChunkInfo = { path: "new.js", size: 200, hash: "new" };

  const withChunk1 = addChunk(manifest, "same-name", chunk1);
  const withChunk2 = addChunk(withChunk1, "same-name", chunk2);

  assert.assertEquals(withChunk2.chunks["same-name"], chunk2);
  assert.assertEquals(Object.keys(withChunk2.chunks).length, 1);
});

// ============================================================================
// getChunk tests
// ============================================================================

Deno.test("getChunk returns chunk by name", () => {
  const manifest = createChunkManifest("main.js", "build-123");
  const chunk: ChunkInfo = { path: "vendor.js", size: 500, hash: "vendor" };
  const updated = addChunk(manifest, "vendor", chunk);

  const result = getChunk(updated, "vendor");

  assert.assertEquals(result, chunk);
});

Deno.test("getChunk returns undefined for non-existent chunk", () => {
  const manifest = createChunkManifest("main.js", "build-123");

  const result = getChunk(manifest, "non-existent");

  assert.assertEquals(result, undefined);
});

// ============================================================================
// hasChunk tests
// ============================================================================

Deno.test("hasChunk returns true for existing chunk", () => {
  const manifest = createChunkManifest("main.js", "build-123");
  const chunk: ChunkInfo = { path: "chunk.js", size: 100, hash: "hash" };
  const updated = addChunk(manifest, "existing", chunk);

  assert.assertEquals(hasChunk(updated, "existing"), true);
});

Deno.test("hasChunk returns false for non-existent chunk", () => {
  const manifest = createChunkManifest("main.js", "build-123");

  assert.assertEquals(hasChunk(manifest, "non-existent"), false);
});

// ============================================================================
// getTotalSize tests
// ============================================================================

Deno.test("getTotalSize returns 0 for empty manifest", () => {
  const manifest = createChunkManifest("main.js", "build-123");

  assert.assertEquals(getTotalSize(manifest), 0);
});

Deno.test("getTotalSize sums all chunk sizes", () => {
  let manifest = createChunkManifest("main.js", "build-123");
  manifest = addChunk(manifest, "chunk1", {
    path: "c1.js",
    size: 100,
    hash: "h1",
  });
  manifest = addChunk(manifest, "chunk2", {
    path: "c2.js",
    size: 250,
    hash: "h2",
  });
  manifest = addChunk(manifest, "chunk3", {
    path: "c3.js",
    size: 150,
    hash: "h3",
  });

  assert.assertEquals(getTotalSize(manifest), 500);
});

Deno.test("getTotalSize handles single chunk", () => {
  let manifest = createChunkManifest("main.js", "build-123");
  manifest = addChunk(manifest, "only", {
    path: "only.js",
    size: 777,
    hash: "h",
  });

  assert.assertEquals(getTotalSize(manifest), 777);
});

// ============================================================================
// getAllPaths tests
// ============================================================================

Deno.test("getAllPaths returns empty array for empty manifest", () => {
  const manifest = createChunkManifest("main.js", "build-123");

  const paths = getAllPaths(manifest);

  assert.assertEquals(paths, []);
});

Deno.test("getAllPaths returns all chunk paths", () => {
  let manifest = createChunkManifest("main.js", "build-123");
  manifest = addChunk(manifest, "a", { path: "a.js", size: 1, hash: "ha" });
  manifest = addChunk(manifest, "b", { path: "b.js", size: 1, hash: "hb" });
  manifest = addChunk(manifest, "c", { path: "c.js", size: 1, hash: "hc" });

  const paths = getAllPaths(manifest);

  assert.assertEquals(paths.length, 3);
  assert.assert(paths.includes("a.js"));
  assert.assert(paths.includes("b.js"));
  assert.assert(paths.includes("c.js"));
});

// ============================================================================
// serializeManifest / parseManifest tests
// ============================================================================

Deno.test("serializeManifest produces valid JSON string", () => {
  const manifest = createChunkManifest("main.js", "build-123");

  const json = serializeManifest(manifest);

  assert.assertExists(json);
  assert.assert(json.length > 0);
  // Should not throw
  JSON.parse(json);
});

Deno.test("parseManifest parses JSON to manifest", () => {
  const original = createChunkManifest("main.js", "build-123");
  const json = serializeManifest(original);

  const parsed = parseManifest(json);

  assert.assertEquals(parsed.entrypoint, original.entrypoint);
  assert.assertEquals(parsed.buildId, original.buildId);
  assert.assertEquals(parsed.timestamp, original.timestamp);
});

Deno.test("serializeManifest and parseManifest round-trip preserves data", () => {
  let manifest = createChunkManifest("main.js", "build-abc");
  manifest = addChunk(manifest, "vendor", {
    path: "vendor-xyz.js",
    size: 12345,
    hash: "xyz123",
  });
  manifest = addChunk(manifest, "main", {
    path: "main-abc.js",
    size: 6789,
    hash: "abc456",
  });

  const json = serializeManifest(manifest);
  const parsed = parseManifest(json);

  assert.assertEquals(parsed.entrypoint, manifest.entrypoint);
  assert.assertEquals(parsed.buildId, manifest.buildId);
  assert.assertEquals(parsed.timestamp, manifest.timestamp);
  assert.assertEquals(Object.keys(parsed.chunks).length, 2);
  assert.assertEquals(parsed.chunks["vendor"]?.path, "vendor-xyz.js");
  assert.assertEquals(parsed.chunks["vendor"]?.size, 12345);
  assert.assertEquals(parsed.chunks["main"]?.hash, "abc456");
});

Deno.test("serializeManifest includes all manifest properties", () => {
  let manifest = createChunkManifest("entry.js", "id-999");
  manifest = addChunk(manifest, "test", { path: "t.js", size: 50, hash: "th" });

  const json = serializeManifest(manifest);
  const obj = JSON.parse(json) as ChunkManifest;

  assert.assertEquals(obj.entrypoint, "entry.js");
  assert.assertEquals(obj.buildId, "id-999");
  assert.assertExists(obj.timestamp);
  assert.assertExists(obj.chunks);
  assert.assertExists(obj.chunks["test"]);
});

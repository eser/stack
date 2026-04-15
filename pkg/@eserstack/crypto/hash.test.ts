// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { computeCombinedHash, computeHash, computeStringHash } from "./hash.ts";

// ============================================================================
// computeHash tests
// ============================================================================

Deno.test("computeHash returns hex string with default length", async () => {
  const content = new Uint8Array([1, 2, 3, 4, 5]);
  const hash = await computeHash(content);

  assert.assertExists(hash);
  assert.assertEquals(hash.length, 16);
  assert.assertMatch(hash, /^[0-9a-f]+$/);
});

Deno.test("computeHash produces consistent results for same content", async () => {
  const content = new Uint8Array([1, 2, 3, 4, 5]);

  const hash1 = await computeHash(content);
  const hash2 = await computeHash(content);

  assert.assertEquals(hash1, hash2);
});

Deno.test("computeHash produces different results for different content", async () => {
  const content1 = new Uint8Array([1, 2, 3]);
  const content2 = new Uint8Array([4, 5, 6]);

  const hash1 = await computeHash(content1);
  const hash2 = await computeHash(content2);

  assert.assertNotEquals(hash1, hash2);
});

Deno.test("computeHash respects custom length parameter", async () => {
  const content = new Uint8Array([1, 2, 3]);

  const hash8 = await computeHash(content, "SHA-256", 8);
  const hash32 = await computeHash(content, "SHA-256", 32);

  assert.assertEquals(hash8.length, 8);
  assert.assertEquals(hash32.length, 32);
});

Deno.test("computeHash supports SHA-1 algorithm", async () => {
  const content = new Uint8Array([1, 2, 3]);

  const hash = await computeHash(content, "SHA-1");

  assert.assertExists(hash);
  assert.assertEquals(hash.length, 16);
  assert.assertMatch(hash, /^[0-9a-f]+$/);
});

Deno.test("computeHash supports SHA-384 algorithm", async () => {
  const content = new Uint8Array([1, 2, 3]);

  const hash = await computeHash(content, "SHA-384");

  assert.assertExists(hash);
  assert.assertEquals(hash.length, 16);
  assert.assertMatch(hash, /^[0-9a-f]+$/);
});

Deno.test("computeHash supports SHA-512 algorithm", async () => {
  const content = new Uint8Array([1, 2, 3]);

  const hash = await computeHash(content, "SHA-512");

  assert.assertExists(hash);
  assert.assertEquals(hash.length, 16);
  assert.assertMatch(hash, /^[0-9a-f]+$/);
});

Deno.test("computeHash handles empty content", async () => {
  const content = new Uint8Array([]);

  const hash = await computeHash(content);

  assert.assertExists(hash);
  assert.assertEquals(hash.length, 16);
});

Deno.test("computeHash produces different results for different algorithms", async () => {
  const content = new Uint8Array([1, 2, 3, 4, 5]);

  const sha256 = await computeHash(content, "SHA-256");
  const sha1 = await computeHash(content, "SHA-1");
  const sha512 = await computeHash(content, "SHA-512");

  assert.assertNotEquals(sha256, sha1);
  assert.assertNotEquals(sha256, sha512);
  assert.assertNotEquals(sha1, sha512);
});

// ============================================================================
// computeStringHash tests
// ============================================================================

Deno.test("computeStringHash returns hex string", async () => {
  const hash = await computeStringHash("hello world");

  assert.assertExists(hash);
  assert.assertEquals(hash.length, 16);
  assert.assertMatch(hash, /^[0-9a-f]+$/);
});

Deno.test("computeStringHash produces same result as computeHash for encoded string", async () => {
  const text = "hello world";
  const encoded = new TextEncoder().encode(text);

  const stringHash = await computeStringHash(text);
  const binaryHash = await computeHash(encoded);

  assert.assertEquals(stringHash, binaryHash);
});

Deno.test("computeStringHash handles empty string", async () => {
  const hash = await computeStringHash("");

  assert.assertExists(hash);
  assert.assertEquals(hash.length, 16);
});

Deno.test("computeStringHash handles unicode content", async () => {
  const hash = await computeStringHash("Hello, Dünya!");

  assert.assertExists(hash);
  assert.assertEquals(hash.length, 16);
  assert.assertMatch(hash, /^[0-9a-f]+$/);
});

Deno.test("computeStringHash produces consistent results", async () => {
  const text = "test content";

  const hash1 = await computeStringHash(text);
  const hash2 = await computeStringHash(text);

  assert.assertEquals(hash1, hash2);
});

Deno.test("computeStringHash respects algorithm parameter", async () => {
  const text = "test";

  const sha256 = await computeStringHash(text, "SHA-256");
  const sha1 = await computeStringHash(text, "SHA-1");

  assert.assertNotEquals(sha256, sha1);
});

Deno.test("computeStringHash respects length parameter", async () => {
  const text = "test";

  const hash = await computeStringHash(text, "SHA-256", 24);

  assert.assertEquals(hash.length, 24);
});

// ============================================================================
// computeCombinedHash tests
// ============================================================================

Deno.test("computeCombinedHash combines multiple arrays", async () => {
  const arr1 = new Uint8Array([1, 2]);
  const arr2 = new Uint8Array([3, 4]);

  const hash = await computeCombinedHash([arr1, arr2]);

  assert.assertExists(hash);
  assert.assertEquals(hash.length, 16);
  assert.assertMatch(hash, /^[0-9a-f]+$/);
});

Deno.test("computeCombinedHash produces same hash as single combined array", async () => {
  const arr1 = new Uint8Array([1, 2]);
  const arr2 = new Uint8Array([3, 4]);
  const combined = new Uint8Array([1, 2, 3, 4]);

  const combinedHash = await computeCombinedHash([arr1, arr2]);
  const singleHash = await computeHash(combined);

  assert.assertEquals(combinedHash, singleHash);
});

Deno.test("computeCombinedHash handles single item array", async () => {
  const arr = new Uint8Array([1, 2, 3]);

  const combinedHash = await computeCombinedHash([arr]);
  const singleHash = await computeHash(arr);

  assert.assertEquals(combinedHash, singleHash);
});

Deno.test("computeCombinedHash handles empty array", async () => {
  const hash = await computeCombinedHash([]);

  assert.assertExists(hash);
  assert.assertEquals(hash.length, 16);
});

Deno.test("computeCombinedHash handles arrays with empty Uint8Arrays", async () => {
  const arr1 = new Uint8Array([]);
  const arr2 = new Uint8Array([1, 2]);
  const arr3 = new Uint8Array([]);

  const hash = await computeCombinedHash([arr1, arr2, arr3]);

  assert.assertExists(hash);
  assert.assertEquals(hash.length, 16);
});

Deno.test("computeCombinedHash order matters", async () => {
  const arr1 = new Uint8Array([1, 2]);
  const arr2 = new Uint8Array([3, 4]);

  const hash1 = await computeCombinedHash([arr1, arr2]);
  const hash2 = await computeCombinedHash([arr2, arr1]);

  assert.assertNotEquals(hash1, hash2);
});

Deno.test("computeCombinedHash respects algorithm parameter", async () => {
  const arr1 = new Uint8Array([1, 2]);
  const arr2 = new Uint8Array([3, 4]);

  const sha256 = await computeCombinedHash([arr1, arr2], "SHA-256");
  const sha1 = await computeCombinedHash([arr1, arr2], "SHA-1");

  assert.assertNotEquals(sha256, sha1);
});

Deno.test("computeCombinedHash respects length parameter", async () => {
  const arr1 = new Uint8Array([1, 2]);
  const arr2 = new Uint8Array([3, 4]);

  const hash = await computeCombinedHash([arr1, arr2], "SHA-256", 20);

  assert.assertEquals(hash.length, 20);
});

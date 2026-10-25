// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as hash from "./hash.ts";

// ============================================================================
// computeHash tests
// ============================================================================

nodeTest.test(
  "computeHash returns hex string with default length",
  async () => {
    const content = new Uint8Array([1, 2, 3, 4, 5]);
    const digest = await hash.computeHash(content);

    assert.assertExists(digest);
    assert.assertEquals(digest.length, 16);
    assert.assertMatch(digest, /^[0-9a-f]+$/);
  },
);

nodeTest.test(
  "computeHash produces consistent results for same content",
  async () => {
    const content = new Uint8Array([1, 2, 3, 4, 5]);

    const hash1 = await hash.computeHash(content);
    const hash2 = await hash.computeHash(content);

    assert.assertEquals(hash1, hash2);
  },
);

nodeTest.test(
  "computeHash produces different results for different content",
  async () => {
    const content1 = new Uint8Array([1, 2, 3]);
    const content2 = new Uint8Array([4, 5, 6]);

    const hash1 = await hash.computeHash(content1);
    const hash2 = await hash.computeHash(content2);

    assert.assertNotEquals(hash1, hash2);
  },
);

nodeTest.test("computeHash respects custom length parameter", async () => {
  const content = new Uint8Array([1, 2, 3]);

  const hash8 = await hash.computeHash(content, "SHA-256", 8);
  const hash32 = await hash.computeHash(content, "SHA-256", 32);

  assert.assertEquals(hash8.length, 8);
  assert.assertEquals(hash32.length, 32);
});

nodeTest.test("computeHash supports SHA-1 algorithm", async () => {
  const content = new Uint8Array([1, 2, 3]);

  const digest = await hash.computeHash(content, "SHA-1");

  assert.assertExists(digest);
  assert.assertEquals(digest.length, 16);
  assert.assertMatch(digest, /^[0-9a-f]+$/);
});

nodeTest.test("computeHash supports SHA-384 algorithm", async () => {
  const content = new Uint8Array([1, 2, 3]);

  const digest = await hash.computeHash(content, "SHA-384");

  assert.assertExists(digest);
  assert.assertEquals(digest.length, 16);
  assert.assertMatch(digest, /^[0-9a-f]+$/);
});

nodeTest.test("computeHash supports SHA-512 algorithm", async () => {
  const content = new Uint8Array([1, 2, 3]);

  const digest = await hash.computeHash(content, "SHA-512");

  assert.assertExists(digest);
  assert.assertEquals(digest.length, 16);
  assert.assertMatch(digest, /^[0-9a-f]+$/);
});

nodeTest.test("computeHash handles empty content", async () => {
  const content = new Uint8Array([]);

  const digest = await hash.computeHash(content);

  assert.assertExists(digest);
  assert.assertEquals(digest.length, 16);
});

nodeTest.test(
  "computeHash produces different results for different algorithms",
  async () => {
    const content = new Uint8Array([1, 2, 3, 4, 5]);

    const sha256 = await hash.computeHash(content, "SHA-256");
    const sha1 = await hash.computeHash(content, "SHA-1");
    const sha512 = await hash.computeHash(content, "SHA-512");

    assert.assertNotEquals(sha256, sha1);
    assert.assertNotEquals(sha256, sha512);
    assert.assertNotEquals(sha1, sha512);
  },
);

// ============================================================================
// computeStringHash tests
// ============================================================================

nodeTest.test("computeStringHash returns hex string", async () => {
  const digest = await hash.computeStringHash("hello world");

  assert.assertExists(digest);
  assert.assertEquals(digest.length, 16);
  assert.assertMatch(digest, /^[0-9a-f]+$/);
});

nodeTest.test(
  "computeStringHash produces same result as computeHash for encoded string",
  async () => {
    const text = "hello world";
    const encoded = new TextEncoder().encode(text);

    const stringHash = await hash.computeStringHash(text);
    const binaryHash = await hash.computeHash(encoded);

    assert.assertEquals(stringHash, binaryHash);
  },
);

nodeTest.test("computeStringHash handles empty string", async () => {
  const digest = await hash.computeStringHash("");

  assert.assertExists(digest);
  assert.assertEquals(digest.length, 16);
});

nodeTest.test("computeStringHash handles unicode content", async () => {
  const digest = await hash.computeStringHash("Hello, Dünya!");

  assert.assertExists(digest);
  assert.assertEquals(digest.length, 16);
  assert.assertMatch(digest, /^[0-9a-f]+$/);
});

nodeTest.test("computeStringHash produces consistent results", async () => {
  const text = "test content";

  const hash1 = await hash.computeStringHash(text);
  const hash2 = await hash.computeStringHash(text);

  assert.assertEquals(hash1, hash2);
});

nodeTest.test("computeStringHash respects algorithm parameter", async () => {
  const text = "test";

  const sha256 = await hash.computeStringHash(text, "SHA-256");
  const sha1 = await hash.computeStringHash(text, "SHA-1");

  assert.assertNotEquals(sha256, sha1);
});

nodeTest.test("computeStringHash respects length parameter", async () => {
  const text = "test";

  const digest = await hash.computeStringHash(text, "SHA-256", 24);

  assert.assertEquals(digest.length, 24);
});

// ============================================================================
// computeCombinedHash tests
// ============================================================================

nodeTest.test("computeCombinedHash combines multiple arrays", async () => {
  const arr1 = new Uint8Array([1, 2]);
  const arr2 = new Uint8Array([3, 4]);

  const digest = await hash.computeCombinedHash([arr1, arr2]);

  assert.assertExists(digest);
  assert.assertEquals(digest.length, 16);
  assert.assertMatch(digest, /^[0-9a-f]+$/);
});

nodeTest.test(
  "computeCombinedHash produces same hash as single combined array",
  async () => {
    const arr1 = new Uint8Array([1, 2]);
    const arr2 = new Uint8Array([3, 4]);
    const combined = new Uint8Array([1, 2, 3, 4]);

    const combinedHash = await hash.computeCombinedHash([arr1, arr2]);
    const singleHash = await hash.computeHash(combined);

    assert.assertEquals(combinedHash, singleHash);
  },
);

nodeTest.test("computeCombinedHash handles single item array", async () => {
  const arr = new Uint8Array([1, 2, 3]);

  const combinedHash = await hash.computeCombinedHash([arr]);
  const singleHash = await hash.computeHash(arr);

  assert.assertEquals(combinedHash, singleHash);
});

nodeTest.test("computeCombinedHash handles empty array", async () => {
  const digest = await hash.computeCombinedHash([]);

  assert.assertExists(digest);
  assert.assertEquals(digest.length, 16);
});

nodeTest.test(
  "computeCombinedHash handles arrays with empty Uint8Arrays",
  async () => {
    const arr1 = new Uint8Array([]);
    const arr2 = new Uint8Array([1, 2]);
    const arr3 = new Uint8Array([]);

    const digest = await hash.computeCombinedHash([arr1, arr2, arr3]);

    assert.assertExists(digest);
    assert.assertEquals(digest.length, 16);
  },
);

nodeTest.test("computeCombinedHash order matters", async () => {
  const arr1 = new Uint8Array([1, 2]);
  const arr2 = new Uint8Array([3, 4]);

  const hash1 = await hash.computeCombinedHash([arr1, arr2]);
  const hash2 = await hash.computeCombinedHash([arr2, arr1]);

  assert.assertNotEquals(hash1, hash2);
});

nodeTest.test("computeCombinedHash respects algorithm parameter", async () => {
  const arr1 = new Uint8Array([1, 2]);
  const arr2 = new Uint8Array([3, 4]);

  const sha256 = await hash.computeCombinedHash([arr1, arr2], "SHA-256");
  const sha1 = await hash.computeCombinedHash([arr1, arr2], "SHA-1");

  assert.assertNotEquals(sha256, sha1);
});

nodeTest.test("computeCombinedHash respects length parameter", async () => {
  const arr1 = new Uint8Array([1, 2]);
  const arr2 = new Uint8Array([3, 4]);

  const digest = await hash.computeCombinedHash([arr1, arr2], "SHA-256", 20);

  assert.assertEquals(digest.length, 20);
});

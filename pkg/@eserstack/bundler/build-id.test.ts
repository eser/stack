// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { getBuildId, setBuildId } from "./build-id.ts";

// ============================================================================
// getBuildId tests
// ============================================================================

Deno.test("getBuildId returns a string", async () => {
  const buildId = await getBuildId();

  assert.assertExists(buildId);
  assert.assertEquals(typeof buildId, "string");
});

Deno.test("getBuildId returns hex string", async () => {
  const buildId = await getBuildId();

  // SHA-1 hash encoded as hex should only contain hex characters
  assert.assertMatch(buildId, /^[a-f0-9]+$/);
});

Deno.test("getBuildId returns 40-character SHA-1 hex string", async () => {
  const buildId = await getBuildId();

  // SHA-1 produces 160 bits = 20 bytes = 40 hex characters
  assert.assertEquals(buildId.length, 40);
});

Deno.test("getBuildId returns same value on subsequent calls (memoization)", async () => {
  const buildId1 = await getBuildId();
  const buildId2 = await getBuildId();

  assert.assertEquals(buildId1, buildId2);
});

// ============================================================================
// setBuildId tests
// ============================================================================

Deno.test("setBuildId overrides the build ID", async () => {
  const customBuildId = "custom-build-id-123";

  setBuildId(customBuildId);
  const result = await getBuildId();

  assert.assertEquals(result, customBuildId);
});

Deno.test("setBuildId accepts any string value", async () => {
  const testIds = [
    "abc123",
    "production-build-v1.0.0",
    "0000000000000000",
    "test",
  ];

  for (const testId of testIds) {
    setBuildId(testId);
    const result = await getBuildId();
    assert.assertEquals(result, testId);
  }
});

Deno.test("setBuildId makes subsequent getBuildId calls synchronous", async () => {
  const customBuildId = "sync-test-build-id";

  setBuildId(customBuildId);

  // After setBuildId, the promise should resolve immediately
  const promise = getBuildId();
  assert.assertInstanceOf(promise, Promise);

  const result = await promise;
  assert.assertEquals(result, customBuildId);
});

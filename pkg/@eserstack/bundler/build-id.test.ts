// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as buildId from "./build-id.ts";

// ============================================================================
// getBuildId tests
// ============================================================================

nodeTest.test("getBuildId returns a string", async () => {
  const id = await buildId.getBuildId();

  assert.assertExists(id);
  assert.assertEquals(typeof id, "string");
});

nodeTest.test("getBuildId returns hex string", async () => {
  const id = await buildId.getBuildId();

  // SHA-1 hash encoded as hex should only contain hex characters
  assert.assertMatch(id, /^[a-f0-9]+$/);
});

nodeTest.test("getBuildId returns 40-character SHA-1 hex string", async () => {
  const id = await buildId.getBuildId();

  // SHA-1 produces 160 bits = 20 bytes = 40 hex characters
  assert.assertEquals(id.length, 40);
});

nodeTest.test(
  "getBuildId returns same value on subsequent calls (memoization)",
  async () => {
    const id1 = await buildId.getBuildId();
    const id2 = await buildId.getBuildId();

    assert.assertEquals(id1, id2);
  },
);

// ============================================================================
// setBuildId tests
// ============================================================================

nodeTest.test("setBuildId overrides the build ID", async () => {
  const customBuildId = "custom-build-id-123";

  buildId.setBuildId(customBuildId);
  const result = await buildId.getBuildId();

  assert.assertEquals(result, customBuildId);
});

const anyStringCases = [
  { name: "alphanumeric", id: "abc123" },
  { name: "version-like", id: "production-build-v1.0.0" },
  { name: "all zeros", id: "0000000000000000" },
  { name: "plain word", id: "test" },
];

for (const { name, id } of anyStringCases) {
  nodeTest.test(`setBuildId accepts any string value: ${name}`, async () => {
    buildId.setBuildId(id);
    const result = await buildId.getBuildId();

    assert.assertEquals(result, id);
  });
}

nodeTest.test(
  "setBuildId makes subsequent getBuildId calls synchronous",
  async () => {
    const customBuildId = "sync-test-build-id";

    buildId.setBuildId(customBuildId);

    // After setBuildId, the promise should resolve immediately
    const promise = buildId.getBuildId();
    assert.assertInstanceOf(promise, Promise);

    const result = await promise;
    assert.assertEquals(result, customBuildId);
  },
);

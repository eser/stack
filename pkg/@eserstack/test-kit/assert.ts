// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The assertions the repository's tests use, in one place (decision-3). Tests
 * import this module instead of `@std/assert`, so moving them to another
 * assertion library later (M2-T4, on node:assert) changes this file only.
 *
 * Each export has the signature and behavior of the `@std/assert` function of
 * the same name.
 *
 * @example
 * ```typescript
 * import * as assert from "@eserstack/test-kit/assert";
 *
 * assert.assertEquals({ a: 1 }, { a: 1 });
 * assert.assertStringIncludes("hello world", "world");
 * ```
 *
 * @module
 */

export {
  assert,
  assertArrayIncludes,
  assertEquals,
  assertExists,
  assertFalse,
  assertGreater,
  assertInstanceOf,
  AssertionError,
  assertLess,
  assertMatch,
  assertNotEquals,
  assertNotStrictEquals,
  assertObjectMatch,
  assertRejects,
  assertStrictEquals,
  assertStringIncludes,
  assertThrows,
  fail,
} from "@std/assert";

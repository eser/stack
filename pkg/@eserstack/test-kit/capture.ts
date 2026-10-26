// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Helpers that return what a function throws, for tests that go on to check
 * the error without asserting its class. `assertThrows` and `assertRejects`
 * from `./assert` return the error too; these accept any thrown value and
 * check nothing about it.
 *
 * @example
 * ```typescript
 * import * as assert from "@eserstack/test-kit/assert";
 * import * as capture from "@eserstack/test-kit/capture";
 *
 * const error = capture.captureThrow(() => JSON.parse("{"));
 * assert.assertInstanceOf(error, SyntaxError);
 * ```
 *
 * @module
 */

import * as nodeAssert from "node:assert/strict";

/**
 * Calls `fn` and returns what it throws. Fails the test with an
 * `AssertionError` when `fn` returns without throwing.
 *
 * @param fn - The code expected to throw
 * @returns The thrown value
 */
export const captureThrow = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (error) {
    return error;
  }

  throw new nodeAssert.AssertionError({
    message: "expected the function to throw",
  });
};

/**
 * Awaits `fn()` and returns what it rejects with. Fails the test with an
 * `AssertionError` when the promise resolves.
 *
 * @param fn - The code expected to reject
 * @returns The rejection reason
 */
export const captureRejection = async (
  fn: () => PromiseLike<unknown>,
): Promise<unknown> => {
  try {
    await fn();
  } catch (error) {
    return error;
  }

  throw new nodeAssert.AssertionError({
    message: "expected the promise to reject",
  });
};

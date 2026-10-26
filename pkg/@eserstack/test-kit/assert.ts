// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The assertions the repository's tests use, in one place (decision-3). Tests
 * import this module instead of `node:assert`, so the names and signatures
 * stay the same whatever implements them.
 *
 * Each export keeps the name and signature of the `@std/assert` function the
 * tests used before, and runs on `node:assert/strict`. Equality is Node's
 * strict deep equality: `assertEquals` fails on a different prototype (a
 * null-prototype object against `{}`) and on `-0` against `0`.
 * `assertThrows` and `assertRejects` return the error, and `assertExists`
 * and `assertInstanceOf` narrow the type of the checked value. Every failure
 * is a `node:assert` `AssertionError`, and a `msg` argument adds context to
 * the generated message.
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

import * as nodeAssert from "node:assert/strict";
import * as nodeUtil from "node:util";

export { AssertionError } from "node:assert/strict";

/**
 * A class whose instances an assertion checks for. The `never` parameters
 * accept a constructor with any parameter list.
 */
type AnyConstructor<T = unknown> = abstract new (...args: never) => T;

/** A falsy value, which `assertFalse` narrows to. */
export type Falsy = false | 0 | 0n | "" | null | undefined;

const hasMessage = (msg: string | undefined): msg is string =>
  msg !== undefined && msg !== "";

const suffix = (msg: string | undefined): string =>
  hasMessage(msg) ? `: ${msg}` : ".";

const format = (value: unknown): string =>
  nodeUtil.inspect(value, { depth: 10, sorted: true });

const failure = (
  message: string,
  operator: string,
): nodeAssert.AssertionError =>
  new nodeAssert.AssertionError({ message, operator });

/**
 * Runs a `node:assert` check and puts `msg` in front of the message of the
 * `AssertionError` it throws, so the generated diff is kept.
 */
const withMessage = (msg: string | undefined, check: () => void): void => {
  if (!hasMessage(msg)) {
    check();

    return;
  }

  try {
    check();
  } catch (error) {
    if (error instanceof nodeAssert.AssertionError) {
      error.message = `${msg}\n${error.message}`;
    }

    throw error;
  }
};

/**
 * Fails when `expr` is falsy.
 *
 * @param expr - The value expected to be truthy
 * @param msg - The failure message
 */
export function assert(expr: unknown, msg = ""): asserts expr {
  if (!expr) {
    throw failure(
      hasMessage(msg) ? msg : `Expected a truthy value, got ${format(expr)}`,
      "assert",
    );
  }
}

/**
 * Fails when `expr` is truthy.
 *
 * @param expr - The value expected to be falsy
 * @param msg - The failure message
 */
export function assertFalse(expr: unknown, msg = ""): asserts expr is Falsy {
  if (expr) {
    throw failure(
      hasMessage(msg) ? msg : `Expected a falsy value, got ${format(expr)}`,
      "assertFalse",
    );
  }
}

/**
 * Fails unless `actual` and `expected` are deeply and strictly equal, with
 * the rules of `node:assert`'s `deepStrictEqual`.
 *
 * @param actual - The value under test
 * @param expected - The value it must equal
 * @param msg - Context put in front of the failure message
 */
export function assertEquals<T>(actual: T, expected: T, msg?: string): void {
  withMessage(msg, () => nodeAssert.deepStrictEqual(actual, expected));
}

/**
 * Fails when `actual` and `expected` are deeply and strictly equal.
 *
 * @param actual - The value under test
 * @param expected - The value it must differ from
 * @param msg - Context put in front of the failure message
 */
export function assertNotEquals<T>(actual: T, expected: T, msg?: string): void {
  withMessage(msg, () => nodeAssert.notDeepStrictEqual(actual, expected));
}

/**
 * Fails unless `actual` and `expected` are the same value (`Object.is`).
 *
 * @param actual - The value under test
 * @param expected - The value it must be
 * @param msg - Context put in front of the failure message
 */
export function assertStrictEquals<T>(
  actual: unknown,
  expected: T,
  msg?: string,
): asserts actual is T {
  withMessage(msg, () => nodeAssert.strictEqual(actual, expected));
}

/**
 * Fails when `actual` and `expected` are the same value (`Object.is`).
 *
 * @param actual - The value under test
 * @param expected - The value it must not be
 * @param msg - Context put in front of the failure message
 */
export function assertNotStrictEquals<T>(
  actual: T,
  expected: T,
  msg?: string,
): void {
  withMessage(msg, () => nodeAssert.notStrictEqual(actual, expected));
}

/**
 * Fails when `actual` is `null` or `undefined`, and narrows it otherwise.
 *
 * @param actual - The value expected to exist
 * @param msg - Context appended to the failure message
 */
export function assertExists<T>(
  actual: T,
  msg?: string,
): asserts actual is NonNullable<T> {
  if (actual === undefined || actual === null) {
    throw failure(
      `Expected actual: "${actual}" to not be null or undefined${suffix(msg)}`,
      "assertExists",
    );
  }
}

/**
 * Fails unless `actual` is an instance of `expectedType`, and narrows it
 * otherwise.
 *
 * @param actual - The value under test
 * @param expectedType - The class it must be an instance of
 * @param msg - Context appended to the failure message
 */
export function assertInstanceOf<T extends AnyConstructor>(
  actual: unknown,
  expectedType: T,
  msg = "",
): asserts actual is InstanceType<T> {
  if (actual instanceof expectedType) {
    return;
  }

  const actualType =
    actual === null
      ? "null"
      : typeof actual === "object"
        ? (actual.constructor?.name ?? "Object")
        : typeof actual;

  throw failure(
    `Expected object to be an instance of "${expectedType.name}" but was "${actualType}"${suffix(msg)}`,
    "assertInstanceOf",
  );
}

/**
 * Fails unless `actual` contains `expected`.
 *
 * @param actual - The string under test
 * @param expected - The text it must contain
 * @param msg - Context appended to the failure message
 */
export function assertStringIncludes(
  actual: string,
  expected: string,
  msg?: string,
): void {
  if (actual.includes(expected)) {
    return;
  }

  throw failure(
    `Expected actual: "${actual}" to contain: "${expected}"${suffix(msg)}`,
    "assertStringIncludes",
  );
}

/**
 * Fails unless `expected` matches `actual`.
 *
 * @param actual - The string under test
 * @param expected - The pattern it must match
 * @param msg - Context put in front of the failure message
 */
export function assertMatch(
  actual: string,
  expected: RegExp,
  msg?: string,
): void {
  withMessage(msg, () => nodeAssert.match(actual, expected));
}

const isPrimitive = (value: unknown): boolean =>
  value === null || (typeof value !== "object" && typeof value !== "function");

/**
 * Fails unless every item of `expected` is in `actual`. Primitives are found
 * with `includes`, objects with strict deep equality.
 *
 * @param actual - The array under test
 * @param expected - The items it must contain
 * @param msg - Context appended to the failure message
 */
export function assertArrayIncludes<T>(
  actual: ArrayLike<T>,
  expected: ArrayLike<T>,
  msg?: string,
): void {
  const items = Array.from(actual);
  const missing = Array.from(expected).filter((item) =>
    isPrimitive(item)
      ? !items.includes(item)
      : !items.some((candidate) => nodeUtil.isDeepStrictEqual(item, candidate)),
  );

  if (missing.length === 0) {
    return;
  }

  throw failure(
    `Expected actual: ${format(items)} to include: ${format(Array.from(expected))}${suffix(msg)}\nmissing: ${format(missing)}`,
    "assertArrayIncludes",
  );
}

/**
 * Fails unless `actual` has every property of `expected` with an equal
 * value, with the rules of `node:assert`'s `partialDeepStrictEqual`.
 *
 * @param actual - The object under test
 * @param expected - The properties it must have
 * @param msg - Context put in front of the failure message
 */
export function assertObjectMatch(
  actual: Record<PropertyKey, unknown>,
  expected: Record<PropertyKey, unknown>,
  msg?: string,
): void {
  withMessage(msg, () => nodeAssert.partialDeepStrictEqual(actual, expected));
}

/**
 * Fails unless `actual > expected`.
 *
 * @param actual - The value under test
 * @param expected - The value it must exceed
 * @param msg - The failure message
 */
export function assertGreater<T>(actual: T, expected: T, msg?: string): void {
  if (actual > expected) {
    return;
  }

  throw failure(
    msg ?? `Expect ${format(actual)} > ${format(expected)}`,
    "assertGreater",
  );
}

/**
 * Fails unless `actual < expected`.
 *
 * @param actual - The value under test
 * @param expected - The value it must stay below
 * @param msg - The failure message
 */
export function assertLess<T>(actual: T, expected: T, msg?: string): void {
  if (actual < expected) {
    return;
  }

  throw failure(
    msg ?? `Expect ${format(actual)} < ${format(expected)}`,
    "assertLess",
  );
}

/**
 * Fails the test.
 *
 * @param msg - Context appended to the failure message
 */
export function fail(msg?: string): never {
  nodeAssert.fail(`Failed assertion${suffix(msg)}`);
}

const isErrorClass = (value: unknown): value is AnyConstructor<Error> =>
  typeof value === "function" &&
  (value.prototype instanceof Error || value.prototype === Error.prototype);

type ErrorExpectation = {
  readonly errorClass: AnyConstructor<Error> | undefined;
  readonly msgIncludes: string | undefined;
  readonly msg: string | undefined;
};

/** Sorts the overloaded arguments of `assertThrows` and `assertRejects`. */
const readExpectation = (
  errorClassOrMsg: AnyConstructor<Error> | string | undefined,
  msgIncludesOrMsg: string | undefined,
  msg: string | undefined,
): ErrorExpectation => {
  if (typeof errorClassOrMsg === "string") {
    return {
      errorClass: undefined,
      msgIncludes: undefined,
      msg: errorClassOrMsg,
    };
  }

  if (errorClassOrMsg === undefined || isErrorClass(errorClassOrMsg)) {
    return { errorClass: errorClassOrMsg, msgIncludes: msgIncludesOrMsg, msg };
  }

  return {
    errorClass: undefined,
    msgIncludes: undefined,
    msg: msgIncludesOrMsg,
  };
};

/**
 * Checks a caught error against the class and message the caller expects.
 * Without an expected class, any thrown value passes.
 */
const checkError = (
  error: unknown,
  expectation: ErrorExpectation,
  verb: string,
  operator: string,
): void => {
  const { errorClass, msgIncludes, msg } = expectation;

  if (errorClass === undefined) {
    return;
  }

  if (!(error instanceof Error)) {
    throw failure(`A non-Error object was ${verb}${suffix(msg)}`, operator);
  }

  const actualClass: string = error.constructor?.name ?? "Error";

  if (!(error instanceof errorClass)) {
    throw failure(
      `Expected error to be instance of "${errorClass.name}", but was "${actualClass}"${suffix(msg)}`,
      operator,
    );
  }

  if (
    hasMessage(msgIncludes) &&
    !nodeUtil
      .stripVTControlCharacters(error.message)
      .includes(nodeUtil.stripVTControlCharacters(msgIncludes))
  ) {
    throw failure(
      `Expected error message to include ${JSON.stringify(msgIncludes)}, but got ${JSON.stringify(error.message)}${suffix(msg)}`,
      operator,
    );
  }
};

/**
 * Calls `fn` and returns what it throws. Fails when it returns.
 *
 * @param fn - The code expected to throw
 * @param msg - Context appended to the failure message
 * @returns The thrown value
 */
export function assertThrows(fn: () => unknown, msg?: string): unknown;
/**
 * Calls `fn` and returns the error it throws. Fails when it returns, or when
 * the error is not an `ErrorClass` whose message includes `msgIncludes`.
 *
 * @param fn - The code expected to throw
 * @param ErrorClass - The class the error must be an instance of
 * @param msgIncludes - Text the error message must contain
 * @param msg - Context appended to the failure message
 * @returns The thrown error, typed as `ErrorClass`
 */
export function assertThrows<E extends Error = Error>(
  fn: () => unknown,
  ErrorClass: AnyConstructor<E>,
  msgIncludes?: string,
  msg?: string,
): E;
export function assertThrows<E extends Error = Error>(
  fn: () => unknown,
  errorClassOrMsg?: AnyConstructor<E> | string,
  msgIncludesOrMsg?: string,
  msg?: string,
): unknown {
  const expectation = readExpectation(errorClassOrMsg, msgIncludesOrMsg, msg);

  try {
    fn();
  } catch (error) {
    checkError(error, expectation, "thrown", "assertThrows");

    return error;
  }

  throw failure(
    `Expected function to throw${suffix(expectation.msg)}`,
    "assertThrows",
  );
}

/**
 * Awaits `fn()` and returns what it rejects with. Fails when it resolves, or
 * when `fn` throws or returns something other than a promise.
 *
 * @param fn - The code expected to reject
 * @param msg - Context appended to the failure message
 * @returns The rejection reason
 */
export function assertRejects(
  fn: () => PromiseLike<unknown>,
  msg?: string,
): Promise<unknown>;
/**
 * Awaits `fn()` and returns the error it rejects with. Fails when it
 * resolves, when `fn` throws or returns something other than a promise, or
 * when the error is not an `ErrorClass` whose message includes
 * `msgIncludes`.
 *
 * @param fn - The code expected to reject
 * @param ErrorClass - The class the error must be an instance of
 * @param msgIncludes - Text the error message must contain
 * @param msg - Context appended to the failure message
 * @returns The rejection error, typed as `ErrorClass`
 */
export function assertRejects<E extends Error = Error>(
  fn: () => PromiseLike<unknown>,
  ErrorClass: AnyConstructor<E>,
  msgIncludes?: string,
  msg?: string,
): Promise<E>;
export async function assertRejects<E extends Error = Error>(
  fn: () => PromiseLike<unknown>,
  errorClassOrMsg?: AnyConstructor<E> | string,
  msgIncludesOrMsg?: string,
  msg?: string,
): Promise<unknown> {
  const expectation = readExpectation(errorClassOrMsg, msgIncludesOrMsg, msg);
  let returned: unknown;

  try {
    returned = fn();
  } catch {
    returned = undefined;
  }

  if (
    returned === null ||
    typeof returned !== "object" ||
    !("then" in returned) ||
    typeof returned.then !== "function"
  ) {
    throw failure(
      `Function throws when expected to reject${suffix(expectation.msg)}`,
      "assertRejects",
    );
  }

  try {
    await returned;
  } catch (error) {
    checkError(error, expectation, "rejected", "assertRejects");

    return error;
  }

  throw failure(
    `Expected function to reject${suffix(expectation.msg)}`,
    "assertRejects",
  );
}

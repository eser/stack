// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The Result type: a value that is either a success (`Ok`) or a failure
 * (`Fail`), with its constructors, type guards and combinators. Each result
 * is iterable, so `yield*` inside a generator unwraps an `Ok` or stops the
 * runner (such as `run` in @eserstack/functions) at the first `Fail`.
 *
 * @example
 * ```typescript
 * import * as primitives from "@eserstack/primitives";
 *
 * type PortResult = primitives.results.Result<number, string>;
 *
 * const parsePort = (input: string): PortResult => {
 *   const port = Number(input);
 *
 *   return Number.isInteger(port)
 *     ? primitives.results.ok(port)
 *     : primitives.results.fail(`not a port: ${input}`);
 * };
 *
 * const label = primitives.results.match(parsePort("8080"), {
 *   ok: (port) => `port ${port}`,
 *   fail: (error) => error,
 * });
 * ```
 *
 * @module
 */

// Core types

/** Either a success that holds a `T` or a failure that holds an `E`. */
export type Result<T, E = Error> = Ok<T> | Fail<E>;

/** A successful result that holds a value. Build one with `ok()`. */
export interface Ok<T> {
  /** The discriminant that marks a success; `isOk()` checks it. */
  readonly _tag: "Ok";
  /** The value the operation produced. */
  readonly value: T;
  /**
   * Yields this result once and returns what the runner passes back to
   * `next()`. Runners such as `run` in @eserstack/functions pass `value`, so
   * `yield* result` evaluates to it.
   */
  [Symbol.iterator](): Generator<Ok<T>, T, unknown>;
}

/** A failed result that holds an error. Build one with `fail()`. */
export interface Fail<E> {
  /** The discriminant that marks a failure; `isFail()` checks it. */
  readonly _tag: "Fail";
  /** The error the operation failed with. */
  readonly error: E;
  /**
   * Yields this result for the runner to handle. Runners such as `run` in
   * @eserstack/functions stop there and return this failure, so the generator
   * never resumes past `yield* result`.
   */
  [Symbol.iterator](): Generator<Fail<E>, never, unknown>;
}

// Constructors with iterator support for do-notation
/** Wraps `value` in a successful result. */
export const ok = <T>(value: T): Ok<T> => ({
  _tag: "Ok",
  value,
  *[Symbol.iterator](): Generator<Ok<T>, T, unknown> {
    return (yield this) as T;
  },
});

/** Wraps `error` in a failed result. */
export const fail = <E>(error: E): Fail<E> => ({
  _tag: "Fail",
  error,
  *[Symbol.iterator](): Generator<Fail<E>, never, unknown> {
    return (yield this) as never;
  },
});

// Type guards
/** Returns true when `result` is a success, and narrows it to `Ok<T>`. */
export const isOk = <T, E>(result: Result<T, E>): result is Ok<T> =>
  result._tag === "Ok";

/** Returns true when `result` is a failure, and narrows it to `Fail<E>`. */
export const isFail = <T, E>(result: Result<T, E>): result is Fail<E> =>
  result._tag === "Fail";

// Combinators
/** Applies `f` to the value of a success; a failure passes through as is. */
export const map = <T, U, E>(
  result: Result<T, E>,
  f: (value: T) => U,
): Result<U, E> => (isOk(result) ? ok(f(result.value)) : result);

/**
 * Applies `f`, which returns a result, to the value of a success; a failure
 * passes through unchanged.
 */
export const flatMap = <T, U, E>(
  result: Result<T, E>,
  f: (value: T) => Result<U, E>,
): Result<U, E> => (isOk(result) ? f(result.value) : result);

/** `flatMap` with a widened error type: the error is `E1 | E2`. */
export const flatMapW = <T, U, E1, E2>(
  result: Result<T, E1>,
  f: (value: T) => Result<U, E2>,
): Result<U, E1 | E2> => (isOk(result) ? f(result.value) : result);

/** Applies `f` to the error of a failure; a success passes through as is. */
export const mapError = <T, E, E2>(
  result: Result<T, E>,
  f: (error: E) => E2,
): Result<T, E2> => (isFail(result) ? fail(f(result.error)) : result);

/**
 * Applies `f`, which returns a result, to the error of a failure, so a failure
 * can recover; a success passes through unchanged.
 */
export const flatMapError = <T, E, E2>(
  result: Result<T, E>,
  f: (error: E) => Result<T, E2>,
): Result<T, E2> => (isFail(result) ? f(result.error) : result);

/** `flatMapError` with a widened error type: the error is `E1 | E2`. */
export const flatMapErrorW = <T, E1, E2>(
  result: Result<T, E1>,
  f: (error: E1) => Result<T, E2>,
): Result<T, E1 | E2> => (isFail(result) ? f(result.error) : result);

// Value extraction
/**
 * Returns the value of a success, or `fallback` for a failure. A function
 * fallback is called with the error.
 */
export const getOrElse = <T, E>(
  result: Result<T, E>,
  fallback: T | ((error: E) => T),
): T =>
  isOk(result)
    ? result.value
    : typeof fallback === "function"
      ? (fallback as (error: E) => T)(result.error)
      : fallback;

/**
 * Returns the value of a success, or throws the error of a failure. An error
 * that is not an `Error` is wrapped in one.
 */
export const getOrThrow = <T, E>(result: Result<T, E>): T => {
  if (isOk(result)) return result.value;
  throw result.error instanceof Error
    ? result.error
    : new Error(String(result.error));
};

/** Returns the value of a success, or `null` for a failure. */
export const getOrNull = <T, E>(result: Result<T, E>): T | null =>
  isOk(result) ? result.value : null;

/** Returns the value of a success, or `undefined` for a failure. */
export const getOrUndefined = <T, E>(result: Result<T, E>): T | undefined =>
  isOk(result) ? result.value : undefined;

// Pattern matching
/** Calls `handlers.ok` with the value or `handlers.fail` with the error. */
export const match = <T, E, U>(
  result: Result<T, E>,
  handlers: {
    ok: (value: T) => U;
    fail: (error: E) => U;
  },
): U =>
  isOk(result) ? handlers.ok(result.value) : handlers.fail(result.error);

// Async utilities
/**
 * Awaits `promise` and returns its value as a success, or the rejection as a
 * failure, mapped through `onError`.
 */
export const fromPromise = async <T, E = Error>(
  promise: Promise<T>,
  onError: (error: unknown) => E = (e) => e as E,
): Promise<Result<T, E>> => {
  try {
    return ok(await promise);
  } catch (error) {
    return fail(onError(error));
  }
};

/**
 * Resolves with the value of a success, or rejects with the error of a
 * failure. An error that is not an `Error` is wrapped in one.
 */
export const toPromise = <T, E>(result: Result<T, E>): Promise<T> =>
  isOk(result)
    ? Promise.resolve(result.value)
    : Promise.reject(
        result.error instanceof Error
          ? result.error
          : new Error(String(result.error)),
      );

// Collection utilities
/**
 * Collects the values of all successes in order, or returns the first failure.
 */
export const all = <T, E>(
  items: ReadonlyArray<Result<T, E>>,
): Result<T[], E> => {
  const values: T[] = [];
  for (const result of items) {
    if (isFail(result)) return result;
    values.push(result.value);
  }
  return ok(values);
};

/** Returns the first success, or a failure that holds every error in order. */
export const any = <T, E>(
  items: ReadonlyArray<Result<T, E>>,
): Result<T, E[]> => {
  const errors: E[] = [];
  for (const result of items) {
    if (isOk(result)) return result;
    errors.push(result.error);
  }
  return fail(errors);
};

// Try/catch wrappers
/**
 * Calls `fn` and returns its value as a success, or the thrown error as a
 * failure, mapped through `onError`.
 */
export const tryCatch = <T, E = Error>(
  fn: () => T,
  onError: (error: unknown) => E = (e) => e as E,
): Result<T, E> => {
  try {
    return ok(fn());
  } catch (error) {
    return fail(onError(error));
  }
};

/**
 * Awaits `fn()` and returns its value as a success, or the thrown or rejected
 * error as a failure, mapped through `onError`.
 */
export const tryCatchAsync = async <T, E = Error>(
  fn: () => Promise<T>,
  onError: (error: unknown) => E = (e) => e as E,
): Promise<Result<T, E>> => {
  try {
    return ok(await fn());
  } catch (error) {
    return fail(onError(error));
  }
};

// Tap utilities (for side effects)
/** Calls `fn` with the value of a success and returns `result` unchanged. */
export const tap = <T, E>(
  result: Result<T, E>,
  fn: (value: T) => void,
): Result<T, E> => {
  if (isOk(result)) fn(result.value);
  return result;
};

/** Calls `fn` with the error of a failure and returns `result` unchanged. */
export const tapError = <T, E>(
  result: Result<T, E>,
  fn: (error: E) => void,
): Result<T, E> => {
  if (isFail(result)) fn(result.error);
  return result;
};

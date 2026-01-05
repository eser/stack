// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Type-safe Result type for explicit error handling.
 * Uses discriminated union for exhaustive pattern matching.
 * Implements iterator protocol for do-notation support with yield*.
 */

// Core types
export type Result<T, E = Error> = Ok<T> | Fail<E>;

export interface Ok<T> {
  readonly _tag: "Ok";
  readonly value: T;
  [Symbol.iterator](): Generator<Ok<T>, T, unknown>;
}

export interface Fail<E> {
  readonly _tag: "Fail";
  readonly error: E;
  [Symbol.iterator](): Generator<Fail<E>, never, unknown>;
}

// Constructors with iterator support for do-notation
export const ok = <T>(value: T): Ok<T> => ({
  _tag: "Ok",
  value,
  *[Symbol.iterator](): Generator<Ok<T>, T, unknown> {
    return (yield this) as T;
  },
});

export const fail = <E>(error: E): Fail<E> => ({
  _tag: "Fail",
  error,
  *[Symbol.iterator](): Generator<Fail<E>, never, unknown> {
    return (yield this) as never;
  },
});

// Type guards
export const isOk = <T, E>(result: Result<T, E>): result is Ok<T> =>
  result._tag === "Ok";

export const isFail = <T, E>(result: Result<T, E>): result is Fail<E> =>
  result._tag === "Fail";

// Combinators
export const map = <T, U, E>(
  result: Result<T, E>,
  f: (value: T) => U,
): Result<U, E> => (isOk(result) ? ok(f(result.value)) : result);

export const flatMap = <T, U, E>(
  result: Result<T, E>,
  f: (value: T) => Result<U, E>,
): Result<U, E> => (isOk(result) ? f(result.value) : result);

export const mapError = <T, E, E2>(
  result: Result<T, E>,
  f: (error: E) => E2,
): Result<T, E2> => (isFail(result) ? fail(f(result.error)) : result);

export const flatMapError = <T, E, E2>(
  result: Result<T, E>,
  f: (error: E) => Result<T, E2>,
): Result<T, E2> => (isFail(result) ? f(result.error) : result);

// Value extraction
export const getOrElse = <T, E>(
  result: Result<T, E>,
  fallback: T | ((error: E) => T),
): T =>
  isOk(result)
    ? result.value
    : typeof fallback === "function"
    ? (fallback as (error: E) => T)(result.error)
    : fallback;

export const getOrThrow = <T, E>(result: Result<T, E>): T => {
  if (isOk(result)) return result.value;
  throw result.error instanceof Error
    ? result.error
    : new Error(String(result.error));
};

export const getOrNull = <T, E>(result: Result<T, E>): T | null =>
  isOk(result) ? result.value : null;

export const getOrUndefined = <T, E>(result: Result<T, E>): T | undefined =>
  isOk(result) ? result.value : undefined;

// Pattern matching
export const match = <T, E, U>(
  result: Result<T, E>,
  handlers: {
    ok: (value: T) => U;
    fail: (error: E) => U;
  },
): U => (isOk(result)
  ? handlers.ok(result.value)
  : handlers.fail(result.error));

// Async utilities
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

export const toPromise = <T, E>(result: Result<T, E>): Promise<T> =>
  isOk(result) ? Promise.resolve(result.value) : Promise.reject(
    result.error instanceof Error
      ? result.error
      : new Error(String(result.error)),
  );

// Collection utilities
export const all = <T, E>(
  results: ReadonlyArray<Result<T, E>>,
): Result<T[], E> => {
  const values: T[] = [];
  for (const result of results) {
    if (isFail(result)) return result;
    values.push(result.value);
  }
  return ok(values);
};

export const any = <T, E>(
  results: ReadonlyArray<Result<T, E>>,
): Result<T, E[]> => {
  const errors: E[] = [];
  for (const result of results) {
    if (isOk(result)) return result;
    errors.push(result.error);
  }
  return fail(errors);
};

// Try/catch wrapper
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
export const tap = <T, E>(
  result: Result<T, E>,
  fn: (value: T) => void,
): Result<T, E> => {
  if (isOk(result)) fn(result.value);
  return result;
};

export const tapError = <T, E>(
  result: Result<T, E>,
  fn: (error: E) => void,
): Result<T, E> => {
  if (isFail(result)) fn(result.error);
  return result;
};

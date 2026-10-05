// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The Option type: a value that is either present (`Some`) or absent (`None`),
 * with its constructors, type guards and combinators.
 *
 * @example
 * ```typescript
 * import * as primitives from "@eserstack/primitives";
 *
 * const env: Record<string, string | undefined> = { PORT: "8080" };
 * const port = primitives.options.fromNullable(env["PORT"]);
 *
 * const value = primitives.options.getOrElse(
 *   primitives.options.map(port, Number),
 *   3000,
 * );
 * ```
 *
 * @module
 */

import * as results from "./results.ts";

// Core types

/** Either a present value (`Some<T>`) or no value (`None`). */
export type Option<T> = Some<T> | None;

/** An option that holds a value. Build one with `some()`. */
export interface Some<T> {
  /** The discriminant that marks a present value; `isSome()` checks it. */
  readonly _tag: "Some";
  /** The value the option holds. */
  readonly value: T;
}

/** An option that holds no value. Use the `none` constant. */
export interface None {
  /** The discriminant that marks an absent value; `isNone()` checks it. */
  readonly _tag: "None";
}

// Constructors
/** Wraps `value` in an option that holds it. */
export const some = <T>(value: T): Some<T> => ({ _tag: "Some", value });
/** The option that holds no value. */
export const none: None = { _tag: "None" };

// Type guards
/** Returns true when `option` holds a value, and narrows it to `Some<T>`. */
export const isSome = <T>(option: Option<T>): option is Some<T> =>
  option._tag === "Some";

/** Returns true when `option` holds no value, and narrows it to `None`. */
export const isNone = <T>(option: Option<T>): option is None =>
  option._tag === "None";

// From nullable values
/** Returns `none` for `null` or `undefined`, and `some(value)` otherwise. */
export const fromNullable = <T>(value: T | null | undefined): Option<T> =>
  value === null || value === undefined ? none : some(value);

/**
 * Returns `none` for a falsy value, such as `null`, `undefined`, `false`, `0`
 * or `""`, and `some(value)` otherwise.
 */
export const fromFalsy = <T>(
  value: T | null | undefined | false | 0 | "",
): Option<T> => value ? some(value as T) : none;

// Combinators
/** Applies `f` to a held value; `none` passes through as is. */
export const map = <T, U>(option: Option<T>, f: (value: T) => U): Option<U> =>
  isSome(option) ? some(f(option.value)) : none;

/**
 * Applies `f`, which returns an option, to a held value; `none` passes through
 * as is.
 */
export const flatMap = <T, U>(
  option: Option<T>,
  f: (value: T) => Option<U>,
): Option<U> => (isSome(option) ? f(option.value) : none);

/** Keeps a held value that passes `predicate`, and returns `none` otherwise. */
export const filter = <T>(
  option: Option<T>,
  predicate: (value: T) => boolean,
): Option<T> => (isSome(option) && predicate(option.value) ? option : none);

// Value extraction
/**
 * Returns the held value, or `fallback` for `none`. A function fallback is
 * called only when it is needed.
 */
export const getOrElse = <T>(option: Option<T>, fallback: T | (() => T)): T =>
  isSome(option)
    ? option.value
    : typeof fallback === "function"
    ? (fallback as () => T)()
    : fallback;

/** Returns the held value, or `null` for `none`. */
export const getOrNull = <T>(option: Option<T>): T | null =>
  isSome(option) ? option.value : null;

/** Returns the held value, or `undefined` for `none`. */
export const getOrUndefined = <T>(option: Option<T>): T | undefined =>
  isSome(option) ? option.value : undefined;

/** Returns the held value, or throws an `Error` with `message` for `none`. */
export const getOrThrow = <T>(
  option: Option<T>,
  message = "Option is None",
): T => {
  if (isSome(option)) return option.value;
  throw new Error(message);
};

// Pattern matching
/** Calls `handlers.some` with the held value or `handlers.none`. */
export const match = <T, U>(
  option: Option<T>,
  handlers: {
    some: (value: T) => U;
    none: () => U;
  },
): U => (isSome(option) ? handlers.some(option.value) : handlers.none());

// Conversion to Result
/**
 * Converts a held value to a success, and `none` to a failure that holds
 * `error`. A function error is called only when it is needed.
 */
export const toResult = <T, E>(
  option: Option<T>,
  error: E | (() => E),
): results.Result<T, E> =>
  isSome(option)
    ? results.ok(option.value)
    : results.fail(typeof error === "function" ? (error as () => E)() : error);

// From Result
/** Converts a success to `some(value)`, and a failure to `none`. */
export const fromResult = <T, E>(result: results.Result<T, E>): Option<T> =>
  result._tag === "Ok" ? some(result.value) : none;

// Collection utilities
/** Collects every held value in order, or returns `none` if any is `none`. */
export const all = <T>(options: ReadonlyArray<Option<T>>): Option<T[]> => {
  const values: T[] = [];
  for (const option of options) {
    if (isNone(option)) return none;
    values.push(option.value);
  }
  return some(values);
};

/** Returns the first option that holds a value, or `none`. */
export const any = <T>(options: ReadonlyArray<Option<T>>): Option<T> => {
  for (const option of options) {
    if (isSome(option)) return option;
  }
  return none;
};

// Alternative/fallback
/**
 * Returns `option` when it holds a value, and `alternative` otherwise. A
 * function alternative is called only when it is needed.
 */
export const orElse = <T>(
  option: Option<T>,
  alternative: Option<T> | (() => Option<T>),
): Option<T> =>
  isSome(option)
    ? option
    : typeof alternative === "function"
    ? (alternative as () => Option<T>)()
    : alternative;

// Tap utilities (for side effects)
/** Calls `fn` with a held value and returns `option` unchanged. */
export const tap = <T>(
  option: Option<T>,
  fn: (value: T) => void,
): Option<T> => {
  if (isSome(option)) fn(option.value);
  return option;
};

/** Calls `fn` when `option` is `none` and returns `option` unchanged. */
export const tapNone = <T>(option: Option<T>, fn: () => void): Option<T> => {
  if (isNone(option)) fn();
  return option;
};

// Zip/combine
/** Pairs two held values, or returns `none` if either option is `none`. */
export const zip = <T, U>(
  optionA: Option<T>,
  optionB: Option<U>,
): Option<[T, U]> =>
  isSome(optionA) && isSome(optionB)
    ? some([optionA.value, optionB.value])
    : none;

/**
 * Combines two held values with `f`, or returns `none` if either option is
 * `none`.
 */
export const zipWith = <T, U, R>(
  optionA: Option<T>,
  optionB: Option<U>,
  f: (a: T, b: U) => R,
): Option<R> =>
  isSome(optionA) && isSome(optionB)
    ? some(f(optionA.value, optionB.value))
    : none;

// Contains check
/** Returns true when `option` holds a value strictly equal to `value`. */
export const contains = <T>(option: Option<T>, value: T): boolean =>
  isSome(option) && option.value === value;

/** Returns true when `option` holds a value that passes `predicate`. */
export const exists = <T>(
  option: Option<T>,
  predicate: (value: T) => boolean,
): boolean => isSome(option) && predicate(option.value);

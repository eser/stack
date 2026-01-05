// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Result } from "./results.ts";
import { fail, ok } from "./results.ts";

/**
 * Type-safe Option type for nullable value handling.
 * Uses discriminated union for exhaustive pattern matching.
 */

// Core types
export type Option<T> = Some<T> | None;

export interface Some<T> {
  readonly _tag: "Some";
  readonly value: T;
}

export interface None {
  readonly _tag: "None";
}

// Constructors
export const some = <T>(value: T): Some<T> => ({ _tag: "Some", value });
export const none: None = { _tag: "None" };

// From nullable values
export const fromNullable = <T>(value: T | null | undefined): Option<T> =>
  value == null ? none : some(value);

export const fromFalsy = <T>(
  value: T | null | undefined | false | 0 | "",
): Option<T> => value ? some(value as T) : none;

// Type guards
export const isSome = <T>(option: Option<T>): option is Some<T> =>
  option._tag === "Some";

export const isNone = <T>(option: Option<T>): option is None =>
  option._tag === "None";

// Combinators
export const map = <T, U>(option: Option<T>, f: (value: T) => U): Option<U> =>
  isSome(option) ? some(f(option.value)) : none;

export const flatMap = <T, U>(
  option: Option<T>,
  f: (value: T) => Option<U>,
): Option<U> => (isSome(option) ? f(option.value) : none);

export const filter = <T>(
  option: Option<T>,
  predicate: (value: T) => boolean,
): Option<T> => (isSome(option) && predicate(option.value) ? option : none);

// Value extraction
export const getOrElse = <T>(option: Option<T>, fallback: T | (() => T)): T =>
  isSome(option)
    ? option.value
    : typeof fallback === "function"
    ? (fallback as () => T)()
    : fallback;

export const getOrNull = <T>(option: Option<T>): T | null =>
  isSome(option) ? option.value : null;

export const getOrUndefined = <T>(option: Option<T>): T | undefined =>
  isSome(option) ? option.value : undefined;

export const getOrThrow = <T>(
  option: Option<T>,
  message = "Option is None",
): T => {
  if (isSome(option)) return option.value;
  throw new Error(message);
};

// Pattern matching
export const match = <T, U>(
  option: Option<T>,
  handlers: {
    some: (value: T) => U;
    none: () => U;
  },
): U => (isSome(option) ? handlers.some(option.value) : handlers.none());

// Conversion to Result
export const toResult = <T, E>(
  option: Option<T>,
  error: E | (() => E),
): Result<T, E> =>
  isSome(option)
    ? ok(option.value)
    : fail(typeof error === "function" ? (error as () => E)() : error);

// From Result
export const fromResult = <T, E>(result: Result<T, E>): Option<T> =>
  result._tag === "Ok" ? some(result.value) : none;

// Collection utilities
export const all = <T>(options: ReadonlyArray<Option<T>>): Option<T[]> => {
  const values: T[] = [];
  for (const option of options) {
    if (isNone(option)) return none;
    values.push(option.value);
  }
  return some(values);
};

export const any = <T>(options: ReadonlyArray<Option<T>>): Option<T> => {
  for (const option of options) {
    if (isSome(option)) return option;
  }
  return none;
};

// Alternative/fallback
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
export const tap = <T>(
  option: Option<T>,
  fn: (value: T) => void,
): Option<T> => {
  if (isSome(option)) fn(option.value);
  return option;
};

export const tapNone = <T>(option: Option<T>, fn: () => void): Option<T> => {
  if (isNone(option)) fn();
  return option;
};

// Zip/combine
export const zip = <T, U>(
  optionA: Option<T>,
  optionB: Option<U>,
): Option<[T, U]> =>
  isSome(optionA) && isSome(optionB)
    ? some([optionA.value, optionB.value])
    : none;

export const zipWith = <T, U, R>(
  optionA: Option<T>,
  optionB: Option<U>,
  f: (a: T, b: U) => R,
): Option<R> =>
  isSome(optionA) && isSome(optionB)
    ? some(f(optionA.value, optionB.value))
    : none;

// Contains check
export const contains = <T>(option: Option<T>, value: T): boolean =>
  isSome(option) && option.value === value;

export const exists = <T>(
  option: Option<T>,
  predicate: (value: T) => boolean,
): boolean => isSome(option) && predicate(option.value);

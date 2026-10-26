// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Functional pipe utility — compose functions left to right.
 *
 * @module
 */

type UnaryFn<T, R> = (input: T) => R;

/**
 * Pipe a value through a sequence of functions, left to right.
 *
 * ```typescript
 * const result = pipe(
 *   5,
 *   (x) => x * 2,
 *   (x) => x + 1,
 *   (x) => `Result: ${x}`,
 * );
 * // result === "Result: 11"
 * ```
 */
const pipe = <T>(
  initial: T,
  ...fns: ReadonlyArray<UnaryFn<unknown, unknown>>
): unknown => {
  return fns.reduce((acc, fn) => fn(acc), initial as unknown);
};

/**
 * Create a composed function from a sequence of functions (left to right).
 *
 * ```typescript
 * const transform = compose(
 *   (x: number) => x * 2,
 *   (x: number) => x + 1,
 * );
 * transform(5); // 11
 * ```
 */
const compose = <T>(
  ...fns: ReadonlyArray<UnaryFn<unknown, unknown>>
): UnaryFn<T, unknown> => {
  return (input: T) => pipe(input, ...fns);
};

export { compose, pipe };

export type { UnaryFn };

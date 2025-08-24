// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as functions from "@eser/standards/functions";

// deno-lint-ignore no-explicit-any
type ComposableFunction = functions.GenericFunction<any, any>;

/**
 * Compose functions from right to left, creating a new function that applies
 * each function to the result of the previous one.
 *
 * The rightmost function can accept multiple arguments, while the remaining
 * functions must accept a single argument (the result of the previous function).
 *
 * @param funcs Functions to compose, applied from right to left
 * @returns A new function that applies all the input functions in sequence
 *
 * @example
 * ```ts
 * const add = (x: number, y: number) => x + y;
 * const double = (x: number) => x * 2;
 * const square = (x: number) => x * x;
 *
 * const composedFn = compose(square, double, add);
 *
 * // Equivalent to: square(double(add(2, 3)))
 * const result = composedFn(2, 3); // Result: 100
 * // Steps: add(2, 3) = 5, double(5) = 10, square(10) = 100
 * ```
 *
 * @example
 * ```ts
 * // String manipulation example
 * const trim = (s: string) => s.trim();
 * const uppercase = (s: string) => s.toUpperCase();
 * const addPrefix = (s: string) => `PREFIX: ${s}`;
 *
 * const processString = compose(addPrefix, uppercase, trim);
 *
 * const result = processString("  hello world  ");
 * // Result: "PREFIX: HELLO WORLD"
 * ```
 */
export const compose = (
  ...funcs: functions.ArgList<ComposableFunction>
): ComposableFunction => {
  return funcs.reduce(
    (previousFunction, currentFunction) =>
    // deno-lint-ignore no-explicit-any
    (...args: functions.ArgList<any>) =>
      previousFunction(currentFunction(...args)),
  );
};

export { compose as default };

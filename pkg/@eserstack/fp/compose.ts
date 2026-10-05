// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type * as functions from "@eserstack/primitives/functions";

// deno-lint-ignore no-explicit-any
type ComposableFunction = functions.GenericFunction<any, any>;

/**
 * Composes functions right to left: `compose(f, g)(x)` is `f(g(x))`. Use
 * `flow` for left-to-right order.
 *
 * @param funcs - The functions, the last one applied first
 * @returns A function that runs them all
 *
 * @example
 * ```typescript
 * import * as fp from "@eserstack/fp";
 *
 * const double = (x: number) => x * 2;
 * const increment = (x: number) => x + 1;
 *
 * fp.compose(double, increment)(3); // 8
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

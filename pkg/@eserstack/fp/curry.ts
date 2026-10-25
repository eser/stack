// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type * as functions from "@eserstack/primitives/functions";
import type * as typeSlices from "@eserstack/primitives/type-slices";

/**
 * Fixes the first arguments of a function. The returned function takes the
 * remaining arguments, which come after the fixed ones.
 *
 * @param func - The function to call
 * @param argsOnLeft - The first arguments, fixed now
 * @returns A function that takes the remaining arguments and calls `func`
 *
 * @example
 * ```typescript
 * import * as fp from "@eserstack/fp";
 *
 * const add = (a: number, b: number) => a + b;
 * const addTen = fp.curry(add, 10);
 *
 * addTen(5); // 15
 * ```
 */
export const curry = <
  // oxlint-disable-next-line typescript/no-explicit-any
  TF extends functions.GenericFunction<any, any>,
  TP extends Partial<Parameters<TF>>,
>(
  func: TF,
  ...argsOnLeft: TP
): ((
  ...argsOnRight: typeSlices.RemainingParameters<Parameters<TF>, TP>
) => ReturnType<TF>) => {
  return (...argsOnRight: typeSlices.RemainingParameters<Parameters<TF>, TP>) =>
    func(...argsOnLeft, ...argsOnRight);
};

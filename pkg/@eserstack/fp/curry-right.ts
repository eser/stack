// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type * as functions from "@eserstack/primitives/functions";
import type * as typeSlices from "@eserstack/primitives/type-slices";

/**
 * Fixes the last arguments of a function. The returned function takes the
 * remaining arguments, which come before the fixed ones.
 *
 * @param func - The function to call
 * @param argsOnRight - The last arguments, fixed now
 * @returns A function that takes the remaining arguments and calls `func`
 *
 * @example
 * ```typescript
 * import * as fp from "@eserstack/fp";
 *
 * const divide = (a: number, b: number) => a / b;
 * const half = fp.curryRight(divide, 2);
 *
 * half(10); // 5
 * ```
 */
export const curryRight = <
  // deno-lint-ignore no-explicit-any
  TF extends functions.GenericFunction<any, any>,
  TP extends Partial<Parameters<TF>>,
>(func: TF, ...argsOnRight: TP): (
  ...argsOnLeft: typeSlices.RemainingParametersRight<Parameters<TF>, TP>
) => ReturnType<TF> => {
  return (
    ...argsOnLeft: typeSlices.RemainingParametersRight<Parameters<TF>, TP>
  ) => func(...argsOnLeft, ...argsOnRight);
};

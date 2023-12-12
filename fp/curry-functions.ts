// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { curry } from "./curry.ts";

export const curryFunctions = <
  T1,
  T2 extends Record<
    string | number | symbol,
    // deno-lint-ignore no-explicit-any
    (...args: readonly [...ReadonlyArray<T1>, ...ReadonlyArray<any>]) => any
  >,
>(
  funcs: T2,
  ...args: ReadonlyArray<T1>
) => {
  return Object.entries(funcs).reduce(
    (obj, [itemKey, value]) => {
      return { ...obj, [itemKey]: curry(value, ...args) };
    },
    // deno-lint-ignore no-explicit-any
    {} as { [T4 in keyof T2]: any },
  );
};

export { curryFunctions as default };

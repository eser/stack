import { curry } from "./curry.ts";

const curryFunctions = <
  T1,
  T2 extends Record<
    string | number | symbol,
    // deno-lint-ignore no-explicit-any
    (...args: readonly [...readonly T1[], ...any]) => any
  >,
>(
  funcs: T2,
  ...args: readonly T1[]
) => {
  return Object.entries(funcs).reduce(
    (obj, [itemKey, value]) => {
      return { ...obj, [itemKey]: curry(value, ...args) };
    },
    // deno-lint-ignore no-explicit-any
    {} as { [T4 in keyof T2]: any },
  );
};

export { curryFunctions, curryFunctions as default };

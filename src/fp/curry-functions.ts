import curry from "./curry.ts";

const curryFunctions = function curryFunctions<
  T1,
  T2 extends Record<
    string | number | symbol,
    // deno-lint-ignore no-explicit-any
    (...args: [...T1[], ...Array<any>]) => any
  >,
  // deno-lint-ignore no-explicit-any
  T3 extends { [T4 in keyof T2]: any },
>(
  funcs: T2,
  ...args: T1[]
): T3 {
  return Object.keys(funcs).reduce(
    (obj, itemKey) => {
      return Object.assign({}, obj, {
        [itemKey]: curry(funcs[itemKey], ...args),
      });
    },
    <T3> {},
  );
};

export { curryFunctions, curryFunctions as default };

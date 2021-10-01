import curry from "./curry.ts";

function curryFunctions<
  T1,
  T2 extends Record<string, (...args: [...Array<T1>, ...Array<any>]) => any>,
  T3 extends { [T4 in keyof T2]: any },
>(
  funcs: T2,
  ...args: Array<T1>
): T3 {
  return Object.keys(funcs).reduce(
    (obj, itemKey) => {
      return Object.assign({}, obj, {
        [itemKey]: curry(funcs[itemKey], ...args),
      });
    },
    <T3> {},
  );
}

export { curryFunctions as default };

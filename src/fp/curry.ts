function curry(
  // deno-lint-ignore no-explicit-any
  func: (...args: Array<any>) => any,
  // deno-lint-ignore no-explicit-any
  ...args: Array<any>
// deno-lint-ignore no-explicit-any
): (...args: Array<any>) => any {
  // deno-lint-ignore no-explicit-any
  return (...args2: Array<any>) => func(...args, ...args2);
}

export { curry as default };

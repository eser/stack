// deno-lint-ignore no-explicit-any
export type ArgList = ReadonlyArray<any>;
// deno-lint-ignore no-explicit-any
export type AnonymousFunction<T = any> = (...args: ArgList) => T;
// deno-lint-ignore no-explicit-any
export type AnonymousClass<T = any> = new (...args: ArgList) => T;

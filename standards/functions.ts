// deno-lint-ignore no-explicit-any
export type ArgList = ReadonlyArray<any>;
// deno-lint-ignore no-explicit-any
export type AnonymousFunction<T = any> = (...args: ArgList) => T;
// deno-lint-ignore no-explicit-any
export type AnonymousClass<T = any> = new (...args: ArgList) => T;

export const nullAsyncGeneratorFn = async function* <TR>(): AsyncGenerator<
  TR
> {};
export const AsyncGeneratorFunction = nullAsyncGeneratorFn.constructor;

export const nullGeneratorFn = function* <TR>(): Generator<TR> {};
export const GeneratorFunction = nullGeneratorFn.constructor;

export const nullAsyncFn = async function <TR = void>(): Promise<TR | void> {};
export const AsyncFunction = nullAsyncFn.constructor;

export const nullFn = function <TR = void>(): TR | void {};
export const Function = globalThis.Function;
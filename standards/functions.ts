// deno-lint-ignore no-explicit-any
export type ArgList = ReadonlyArray<any>;
// deno-lint-ignore no-explicit-any
export type AnonymousFunction<T = any> = (...args: ArgList) => T;
// deno-lint-ignore no-explicit-any
export type AnonymousClass<T = any> = new (...args: ArgList) => T;

export const nullAsyncGeneratorFn = async function* () {};
export const AsyncGeneratorFunction = nullAsyncGeneratorFn.constructor;

export const nullGeneratorFn = function* () {};
export const GeneratorFunction = nullGeneratorFn.constructor;

export const nullAsyncFn = async function () {};
export const AsyncFunction = nullAsyncFn.constructor;

export const nullFn = async function () {};
export const Function = globalThis.Function;

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export type ArgList<T> = ReadonlyArray<T>;
export type GenericFunction<TR, TP> = (...args: ArgList<TP>) => TR;
export type GenericClass<TC, TP> = new (...args: ArgList<TP>) => TC;

export const nullAsyncGeneratorFn = async function* <TR>(): AsyncGenerator<
  TR
> {};
export const AsyncGeneratorFunction = nullAsyncGeneratorFn.constructor;

export const nullGeneratorFn = function* <TR>(): Generator<TR> {};
export const GeneratorFunction = nullGeneratorFn.constructor;

export const nullAsyncFn = async <TR = void>(): Promise<TR | void> => {};
export const AsyncFunction = nullAsyncFn.constructor;

export const nullFn = <TR = void>(): TR | void => {};
export const Function = globalThis.Function;

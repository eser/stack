// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Function and constructor signatures, no-op functions of each kind, and the
 * constructors of those kinds, which `globalThis` does not expose.
 *
 * @example
 * ```typescript
 * import * as primitives from "@eserstack/primitives";
 *
 * const handler = async (): Promise<void> => {};
 * const isAsync = handler instanceof primitives.functions.AsyncFunction;
 * ```
 *
 * @module
 */

/** A read-only argument list whose items are all `T`. */
export type ArgList<T> = ReadonlyArray<T>;
/** A function that takes arguments of type `TP` and returns `TR`. */
export type GenericFunction<TR, TP> = (...args: ArgList<TP>) => TR;
/** A class whose constructor takes arguments of type `TP` and builds `TC`. */
export type GenericClass<TC, TP> = new (...args: ArgList<TP>) => TC;

/** An async generator function that yields nothing. */
export const nullAsyncGeneratorFn = async function* <TR>(): AsyncGenerator<
  TR
> {};
/** The constructor of async generator functions (`AsyncGeneratorFunction`). */
export const AsyncGeneratorFunction: Function =
  nullAsyncGeneratorFn.constructor;

/** A generator function that yields nothing. */
export const nullGeneratorFn = function* <TR>(): Generator<TR> {};
/** The constructor of generator functions (`GeneratorFunction`). */
export const GeneratorFunction: Function = nullGeneratorFn.constructor;

/** An async function that resolves to `undefined`. */
export const nullAsyncFn = async <TR = void>(): Promise<TR | void> => {};
/** The constructor of async functions (`AsyncFunction`). */
export const AsyncFunction: Function = nullAsyncFn.constructor;

/** A function that returns `undefined`. */
export const nullFn = <TR = void>(): TR | void => {};
/** The `Function` constructor, `globalThis.Function`. */
export const Function: FunctionConstructor = globalThis.Function;

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Types for values that may arrive synchronously or asynchronously.
 *
 * @example
 * ```typescript
 * import * as primitives from "@eserstack/primitives";
 *
 * type MaybeAsync = primitives.promises.Promisable<string>;
 *
 * const load = (cached: string | null): MaybeAsync =>
 *   cached ?? Promise.resolve("fresh");
 *
 * const value = await load(null);
 * ```
 *
 * @module
 */

/** A value of type `T`, or a promise that resolves to one. */
export type Promisable<T> = Promise<T> | T;
/** A generator or an async generator that yields values of type `T`. */
export type Generatable<T> = AsyncGenerator<T> | Generator<T>;

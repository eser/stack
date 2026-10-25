// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Type-level helpers that slice tuple types, such as the parameter list of a
 * partially applied function.
 *
 * @example
 * ```typescript
 * import type * as primitives from "@eserstack/primitives";
 *
 * type Params = [string, number, boolean];
 *
 * // string
 * type Head = primitives.typeSlices.First<Params>;
 * // [number, boolean]
 * type Rest = primitives.typeSlices.RemainingParameters<Params, [string]>;
 * ```
 *
 * @module
 */

// Each `any` below is a type-level wildcard for a tuple element in a
// constraint or pattern; no value in this file is typed `any`.

/** The type of the first element of the tuple `T`. */
// deno-lint-ignore no-explicit-any
export type First<T extends ReadonlyArray<any>> = T[0];

/** The type of the last element of the tuple `T`; `never` when it is empty. */
// deno-lint-ignore no-explicit-any
export type Last<T extends ReadonlyArray<any>> = T extends [
  ...infer _Rest,
  infer Last,
]
  ? Last
  : never;

/**
 * The elements of `T1` that remain after removing as many leading elements as
 * `T2` has: the parameters left once `T2` is applied from the left.
 */
// deno-lint-ignore no-explicit-any
export type RemainingParameters<T1 extends any[], T2 extends any[]> =
  // deno-lint-ignore no-explicit-any
  T2 extends [any, ...infer T2Tail]
    ? // deno-lint-ignore no-explicit-any
      T1 extends [any, ...infer T1Tail]
      ? RemainingParameters<T1Tail, T2Tail>
      : []
    : T1;

/**
 * The elements of `T1` that remain after removing as many trailing elements as
 * `T2` has: the parameters left once `T2` is applied from the right.
 */
// deno-lint-ignore no-explicit-any
export type RemainingParametersRight<T1 extends any[], T2 extends any[]> =
  // deno-lint-ignore no-explicit-any
  T2 extends [any, ...infer T2Tail]
    ? // deno-lint-ignore no-explicit-any
      T1 extends [...infer T1Tail, any]
      ? RemainingParametersRight<T1Tail, T2Tail>
      : []
    : T1;

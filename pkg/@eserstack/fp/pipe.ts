// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Threads a value through a series of functions left-to-right.
 * Each function receives the return value of the previous one.
 *
 * @example
 * ```ts
 * import * as fp from "@eserstack/fp";
 *
 * const result = fp.pipe(
 *   "Hello World",
 *   (s) => s.toLowerCase(),
 *   (s) => s.split(" "),
 *   (a) => a.join("-"),
 * );
 * // result: "hello-world"
 * ```
 */
export function pipe<A>(value: A): A;
/** Pipes `value` through 1 function, left to right. */
export function pipe<A, B>(value: A, fn1: (a: A) => B): B;
/** Pipes `value` through 2 functions, left to right. */
export function pipe<A, B, C>(value: A, fn1: (a: A) => B, fn2: (b: B) => C): C;
/** Pipes `value` through 3 functions, left to right. */
export function pipe<A, B, C, D>(
  value: A,
  fn1: (a: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
): D;
/** Pipes `value` through 4 functions, left to right. */
export function pipe<A, B, C, D, E>(
  value: A,
  fn1: (a: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
  fn4: (d: D) => E,
): E;
/** Pipes `value` through 5 functions, left to right. */
export function pipe<A, B, C, D, E, F>(
  value: A,
  fn1: (a: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
  fn4: (d: D) => E,
  fn5: (e: E) => F,
): F;
/** Pipes `value` through 6 functions, left to right. */
export function pipe<A, B, C, D, E, F, G>(
  value: A,
  fn1: (a: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
  fn4: (d: D) => E,
  fn5: (e: E) => F,
  fn6: (f: F) => G,
): G;
/** Pipes `value` through 7 functions, left to right. */
export function pipe<A, B, C, D, E, F, G, H>(
  value: A,
  fn1: (a: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
  fn4: (d: D) => E,
  fn5: (e: E) => F,
  fn6: (f: F) => G,
  fn7: (g: G) => H,
): H;
/** Pipes `value` through 8 functions, left to right. */
export function pipe<A, B, C, D, E, F, G, H, I>(
  value: A,
  fn1: (a: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
  fn4: (d: D) => E,
  fn5: (e: E) => F,
  fn6: (f: F) => G,
  fn7: (g: G) => H,
  fn8: (h: H) => I,
): I;
/** Pipes `value` through 9 functions, left to right. */
export function pipe<A, B, C, D, E, F, G, H, I, J>(
  value: A,
  fn1: (a: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
  fn4: (d: D) => E,
  fn5: (e: E) => F,
  fn6: (f: F) => G,
  fn7: (g: G) => H,
  fn8: (h: H) => I,
  fn9: (i: I) => J,
): J;
export function pipe(
  value: unknown,
  ...fns: Array<(arg: unknown) => unknown>
): unknown {
  return fns.reduce((acc, fn) => fn(acc), value);
}

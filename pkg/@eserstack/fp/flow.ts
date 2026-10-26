// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Composes multiple functions into a single function, executing left-to-right.
 * Unlike `compose`, `flow` applies functions in reading order.
 *
 * @example
 * ```ts
 * import * as fp from "@eserstack/fp";
 *
 * const lower = (x: string) => x.toLowerCase();
 * const spaces = (x: string) => x.split(" ");
 * const dashes = (x: string[]) => x.join("-");
 *
 * const slug = fp.flow(lower, spaces, dashes);
 * slug("Hello World"); // "hello-world"
 * ```
 */
export function flow<A extends unknown[], B>(
  fn1: (...args: A) => B,
): (...args: A) => B;
/** Composes 2 functions left to right. */
export function flow<A extends unknown[], B, C>(
  fn1: (...args: A) => B,
  fn2: (b: B) => C,
): (...args: A) => C;
/** Composes 3 functions left to right. */
export function flow<A extends unknown[], B, C, D>(
  fn1: (...args: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
): (...args: A) => D;
/** Composes 4 functions left to right. */
export function flow<A extends unknown[], B, C, D, E>(
  fn1: (...args: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
  fn4: (d: D) => E,
): (...args: A) => E;
/** Composes 5 functions left to right. */
export function flow<A extends unknown[], B, C, D, E, F>(
  fn1: (...args: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
  fn4: (d: D) => E,
  fn5: (e: E) => F,
): (...args: A) => F;
/** Composes 6 functions left to right. */
export function flow<A extends unknown[], B, C, D, E, F, G>(
  fn1: (...args: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
  fn4: (d: D) => E,
  fn5: (e: E) => F,
  fn6: (f: F) => G,
): (...args: A) => G;
/** Composes 7 functions left to right. */
export function flow<A extends unknown[], B, C, D, E, F, G, H>(
  fn1: (...args: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
  fn4: (d: D) => E,
  fn5: (e: E) => F,
  fn6: (f: F) => G,
  fn7: (g: G) => H,
): (...args: A) => H;
/** Composes 8 functions left to right. */
export function flow<A extends unknown[], B, C, D, E, F, G, H, I>(
  fn1: (...args: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
  fn4: (d: D) => E,
  fn5: (e: E) => F,
  fn6: (f: F) => G,
  fn7: (g: G) => H,
  fn8: (h: H) => I,
): (...args: A) => I;
/** Composes 9 functions left to right. */
export function flow<A extends unknown[], B, C, D, E, F, G, H, I, J>(
  fn1: (...args: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
  fn4: (d: D) => E,
  fn5: (e: E) => F,
  fn6: (f: F) => G,
  fn7: (g: G) => H,
  fn8: (h: H) => I,
  fn9: (i: I) => J,
): (...args: A) => J;
export function flow(
  ...fns: Array<(...args: unknown[]) => unknown>
): (...args: unknown[]) => unknown {
  return (...args) => {
    const [first, ...rest] = fns;
    return rest.reduce((acc, fn) => fn(acc), first!(...args));
  };
}

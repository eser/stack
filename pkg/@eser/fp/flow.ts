// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Composes multiple functions into a single function, executing left-to-right.
 * Unlike `compose`, `flow` applies functions in reading order.
 *
 * @example
 * ```ts
 * import { flow } from "@eser/fp/flow";
 *
 * const lower = (x: string) => x.toLowerCase();
 * const spaces = (x: string) => x.split(" ");
 * const dashes = (x: string[]) => x.join("-");
 *
 * const slug = flow(lower, spaces, dashes);
 * slug("Hello World"); // "hello-world"
 * ```
 */
export function flow<A extends unknown[], B>(
  fn1: (...args: A) => B,
): (...args: A) => B;
export function flow<A extends unknown[], B, C>(
  fn1: (...args: A) => B,
  fn2: (b: B) => C,
): (...args: A) => C;
export function flow<A extends unknown[], B, C, D>(
  fn1: (...args: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
): (...args: A) => D;
export function flow<A extends unknown[], B, C, D, E>(
  fn1: (...args: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
  fn4: (d: D) => E,
): (...args: A) => E;
export function flow<A extends unknown[], B, C, D, E, F>(
  fn1: (...args: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
  fn4: (d: D) => E,
  fn5: (e: E) => F,
): (...args: A) => F;
export function flow<A extends unknown[], B, C, D, E, F, G>(
  fn1: (...args: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
  fn4: (d: D) => E,
  fn5: (e: E) => F,
  fn6: (f: F) => G,
): (...args: A) => G;
export function flow<A extends unknown[], B, C, D, E, F, G, H>(
  fn1: (...args: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
  fn4: (d: D) => E,
  fn5: (e: E) => F,
  fn6: (f: F) => G,
  fn7: (g: G) => H,
): (...args: A) => H;
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

export { flow as default };

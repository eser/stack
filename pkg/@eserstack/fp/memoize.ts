// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * A memoized function, with the `cache` of its results by key.
 */
export type MemoizedFn<TArgs extends Array<unknown>, TResult> = {
  (...args: TArgs): TResult;
  cache: Map<unknown, TResult>;
};

/**
 * Creates a function that memoizes the result of func.
 * By default, the first argument is used as the cache key.
 * Provide a resolver function to use a custom cache key.
 *
 * @param fn - The function to memoize
 * @param resolver - Optional function to generate the cache key from arguments
 * @returns Memoized function with a `cache` property (Map) for cache access
 *
 * @example
 * ```typescript
 * import * as fp from "@eserstack/fp";
 *
 * let calls = 0;
 * const double = fp.memoize((x: number) => {
 *   calls++;
 *   return x * 2;
 * });
 *
 * double(5); // 10; calls is 1
 * double(5); // 10 from the cache; calls is still 1
 *
 * double.cache.delete(5); // forget one result
 * double.cache.clear(); // forget every result
 * ```
 *
 * @example
 * ```typescript
 * import * as fp from "@eserstack/fp";
 *
 * // "Ada" and "ADA" share one cache entry
 * const greet = fp.memoize(
 *   (name: string) => `Hello, ${name.toLowerCase()}`,
 *   (name) => name.toLowerCase(),
 * );
 *
 * greet("Ada"); // "Hello, ada"
 * greet("ADA"); // "Hello, ada", from the cache
 * ```
 */
export const memoize = <TArgs extends Array<unknown>, TResult>(
  fn: (...args: TArgs) => TResult,
  resolver?: (...args: TArgs) => unknown,
): MemoizedFn<TArgs, TResult> => {
  const cache = new Map<unknown, TResult>();

  const memoized = (...args: TArgs): TResult => {
    const key = resolver !== undefined ? resolver(...args) : args[0];

    if (cache.has(key)) {
      return cache.get(key) as TResult;
    }

    const result = fn(...args);
    cache.set(key, result);

    return result;
  };

  memoized.cache = cache;

  return memoized;
};

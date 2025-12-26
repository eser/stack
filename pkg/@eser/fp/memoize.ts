// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

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
 * const expensive = memoize((x: number) => {
 *   console.log('computing...');
 *   return x * 2;
 * });
 *
 * expensive(5); // logs 'computing...', returns 10
 * expensive(5); // returns 10 (cached, no log)
 *
 * // With custom resolver
 * const getUser = memoize(
 *   (id: string, options: { force?: boolean }) => fetchUser(id),
 *   (id, options) => id // Use only id as cache key
 * );
 *
 * // Access cache directly
 * expensive.cache.clear(); // Clear all cached values
 * expensive.cache.delete(5); // Delete specific cached value
 */
export type MemoizedFn<TArgs extends Array<unknown>, TResult> = {
  (...args: TArgs): TResult;
  cache: Map<unknown, TResult>;
};

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

export { memoize as default };

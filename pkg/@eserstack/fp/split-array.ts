// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/** The first items `splitArray` took, and the rest. */
export type SplitArrayResult<T> = { items: Array<T>; rest: Array<T> };

/**
 * Splits the items of an iterable into the first `n` and the rest.
 *
 * @param instance - The items
 * @param n - How many items go in the first part
 * @returns The first items and the rest
 */
export const splitArray = <T>(
  instance: Iterable<T>,
  n: number,
): SplitArrayResult<T> => {
  const arrInstance = (instance.constructor === Array)
    ? <ReadonlyArray<T>> instance
    : [...instance];

  // take n items
  return {
    items: arrInstance.slice(0, n),
    rest: arrInstance.slice(n),
  };
};

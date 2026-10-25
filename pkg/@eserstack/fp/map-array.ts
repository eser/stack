// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Returns the result of `predicate` for each item of an iterable.
 *
 * @param instance - The items
 * @param predicate - Maps an item
 * @returns A new array
 */
export const mapArray = <T1, T2>(
  instance: Iterable<T1>,
  predicate: (value: T1, index: number, instance: Iterable<T1>) => T2,
): Array<T2> => {
  const arrInstance =
    instance.constructor === Array
      ? (instance as ReadonlyArray<T1>)
      : [...instance];

  return arrInstance.map(predicate);
};

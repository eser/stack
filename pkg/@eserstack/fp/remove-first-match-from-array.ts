// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Returns the items of an iterable without the first item for which
 * `predicate` returns `true`.
 *
 * @param instance - The items
 * @param predicate - Finds the item to remove
 * @returns A new array
 */
export const removeFirstMatchFromArray = <T>(
  instance: Iterable<T>,
  predicate: (value: T, index: number, instance: Iterable<T>) => boolean,
): Array<T> => {
  const arrInstance =
    instance.constructor === Array
      ? (instance as ReadonlyArray<T>)
      : [...instance];

  let notFound = true;

  return arrInstance.filter((itemValue, itemKey, obj) => {
    if (notFound && predicate(itemValue, itemKey, obj)) {
      notFound = false;

      return false;
    }

    return true;
  });
};

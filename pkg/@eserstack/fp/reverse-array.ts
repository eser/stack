// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Returns the items of an iterable in reverse order.
 *
 * @param instance - The items
 * @returns A new array
 */
export const reverseArray = <T>(instance: Iterable<T>): Array<T> => {
  const arrInstance = (instance.constructor === Array)
    ? instance as ReadonlyArray<T>
    : [...instance];

  return arrInstance.reduce<Array<T>>(
    (obj, itemValue) => [itemValue, ...obj],
    [],
  );
};

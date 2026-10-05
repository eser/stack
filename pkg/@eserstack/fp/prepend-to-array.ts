// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Returns a new array with `values` added before the items of `instance`.
 *
 * @param instance - The items to start from
 * @param values - The items to add at the start
 * @returns A new array
 */
export const prependToArray = <T>(
  instance: Iterable<T>,
  ...values: ReadonlyArray<T>
): Array<T> => {
  return [...values, ...instance];
};

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Returns a new object with the properties of `instance`, then those of each
 * of `values`. A later property with the same key wins.
 *
 * @param instance - The object to start from
 * @param values - The objects whose properties are added
 * @returns A new object
 */
export const appendToObject = <T>(
  instance: Record<string | number | symbol, T>,
  ...values: ReadonlyArray<Record<string | number | symbol, T>>
): Record<string | number | symbol, T> => {
  return Object.assign({}, instance, ...values);
};

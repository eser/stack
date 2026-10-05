// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Returns a new object with the properties of each of `values`, then those of
 * `instance`. A property of `instance` wins over one with the same key.
 *
 * @param instance - The object whose properties win
 * @param values - The objects whose properties come first
 * @returns A new object
 */
export const prependToObject = <T>(
  instance: Record<string | number | symbol, T>,
  ...values: ReadonlyArray<Record<string | number | symbol, T>>
): Record<string | number | symbol, T> => {
  return Object.assign({}, ...values, instance);
};

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Builds a new object from the values of `instance`, keyed by what
 * `predicate` returns for each value. A value whose key is `undefined` is left
 * out, and a later value with the same key replaces an earlier one.
 *
 * @param instance - The source object
 * @param predicate - Returns the new key for a value, or `undefined` to skip it
 * @returns A new object of the values by their new keys
 */
export const associateObject = <T>(
  instance: Record<string | number | symbol, T>,
  predicate: (
    value: T,
    key: string | number | symbol,
    instance: Record<string | number | symbol, T>,
  ) => string | number | symbol | undefined,
): Record<string | number | symbol, T> => {
  const keys = Object.keys(instance);
  const result: Record<string | number | symbol, T> = {};

  for (let i = 0, len = keys.length; i < len; i++) {
    const itemKey = keys[i]!;
    const value = instance[itemKey] as T;
    const key = predicate(value, itemKey, instance);
    if (key !== undefined) {
      result[key] = value;
    }
  }

  return result;
};

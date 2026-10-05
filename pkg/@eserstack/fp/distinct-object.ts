// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Returns the properties of an object without duplicate values, keeping the
 * first property for each key `predicate` returns.
 *
 * @param instance - The source object
 * @param predicate - Returns the key to compare a value by
 * @returns A new object of the first property for each key
 */
export const distinctObject = <T>(
  instance: Record<string | number | symbol, T>,
  predicate: (
    value: T,
    key: string | number | symbol,
    instance: Record<string | number | symbol, T>,
  ) => unknown,
): Record<string | number | symbol, T> => {
  const predicateValue = predicate ?? ((value: T) => value);
  const keys = Object.keys(instance);
  const result: Record<string | number | symbol, T> = {};
  const seen = new Set<unknown>();

  for (let i = 0, len = keys.length; i < len; i++) {
    const itemKey = keys[i]!;
    const value = instance[itemKey] as T;
    const key = predicateValue(value, itemKey, result);

    if (!seen.has(key)) {
      seen.add(key);
      result[itemKey] = value;
    }
  }

  return result;
};

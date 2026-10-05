// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Returns the properties of an object for which `predicate` returns `true`.
 *
 * @param instance - The source object
 * @param predicate - Decides whether a property stays
 * @returns A new object
 */
export const filterObject = <T>(
  instance: Record<string | number | symbol, T>,
  predicate: (
    value: T,
    key: string | number | symbol,
    instance: Record<string | number | symbol, T>,
  ) => boolean,
): Record<string | number | symbol, T> => {
  const keys = Object.keys(instance);
  const result: Record<string | number | symbol, T> = {};

  for (let i = 0, len = keys.length; i < len; i++) {
    const key = keys[i]!;
    const value = instance[key] as T;
    if (predicate(value, key, instance)) {
      result[key] = value;
    }
  }

  return result;
};

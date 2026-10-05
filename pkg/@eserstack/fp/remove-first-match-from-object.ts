// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Returns an object without the first property for which `predicate` returns
 * `true`.
 *
 * @param instance - The source object
 * @param predicate - Finds the property to remove
 * @returns A new object
 */
export const removeFirstMatchFromObject = <T>(
  instance: Record<string | number | symbol, T>,
  predicate: (
    value: T,
    key: string | number | symbol,
    instance: Record<string | number | symbol, T>,
  ) => boolean,
): Record<string | number | symbol, T> => {
  const keys = Object.keys(instance);
  const result: Record<string | number | symbol, T> = {};
  let removed = false;

  for (let i = 0, len = keys.length; i < len; i++) {
    const key = keys[i]!;
    const value = instance[key] as T;

    if (!removed && predicate(value, key, instance)) {
      removed = true;
      continue;
    }

    result[key] = value;
  }

  return result;
};

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Builds a new object from the properties `predicate` returns for each
 * property of `instance`. Return `null` to add nothing for a property.
 *
 * @param instance - The source object
 * @param predicate - Returns the properties to add for a property, or `null`
 * @returns A new object
 */
export const mapObject = <T1, T2>(
  instance: Record<string | number | symbol, T1>,
  predicate: (
    value: T1,
    key: string | number | symbol,
    instance: Record<string | number | symbol, T1>,
  ) => Record<string | number | symbol, T2> | null,
): Record<string | number | symbol, T2> => {
  const keys = Object.keys(instance);
  const result: Record<string | number | symbol, T2> = {};

  for (let i = 0, len = keys.length; i < len; i++) {
    const key = keys[i]!;
    const mapped = predicate(instance[key] as T1, key, instance);
    if (mapped !== null) {
      Object.assign(result, mapped);
    }
  }

  return result;
};

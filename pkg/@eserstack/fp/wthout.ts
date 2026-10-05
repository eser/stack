// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

type Key = string | number | symbol;

/**
 * Returns a copy of an object without the given keys.
 *
 * @param instance - The source object
 * @param fields - The keys to leave out
 * @returns A new object
 */
export const wthout = <T>(
  instance: Record<Key, T>,
  ...fields: ReadonlyArray<Key>
): Record<Key, T> => {
  const exclude = new Set(fields);
  const keys = Object.keys(instance);
  const result: Record<Key, T> = {};

  for (let i = 0, len = keys.length; i < len; i++) {
    const key = keys[i]!;
    if (!exclude.has(key)) {
      result[key] = instance[key] as T;
    }
  }

  return result;
};

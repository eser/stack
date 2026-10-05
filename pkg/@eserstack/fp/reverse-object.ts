// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Returns an object with the same properties, added in reverse order.
 * Integer-like keys keep their numeric order, as in any object.
 *
 * @param instance - The source object
 * @returns A new object
 */
export const reverseObject = <T>(
  instance: Record<string | number | symbol, T>,
): Record<string | number | symbol, T> => {
  const keys = Object.keys(instance);
  const result: Record<string | number | symbol, T> = {};

  for (let i = keys.length - 1; i >= 0; i--) {
    const key = keys[i]!;
    result[key] = instance[key] as T;
  }

  return result;
};

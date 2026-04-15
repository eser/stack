// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Gets the value at path of object. If the resolved value is undefined,
 * the defaultValue is returned in its place.
 *
 * Uses array path syntax for performance (avoids string parsing overhead).
 *
 * @param object - The object to query
 * @param path - Array of keys representing the path to the value
 * @param defaultValue - The value returned if the resolved value is undefined
 * @returns The resolved value or defaultValue
 *
 * @example
 * const obj = { a: { b: { c: 42 } } };
 *
 * get(obj, ['a', 'b', 'c'])           // 42
 * get(obj, ['a', 'b', 'c', 'd'])      // undefined
 * get(obj, ['a', 'b', 'c', 'd'], 0)   // 0
 * get(obj, ['x', 'y'], 'default')     // 'default'
 *
 * // Works with arrays too
 * get({ items: [1, 2, 3] }, ['items', 1])  // 2
 */
export const get = <T = unknown>(
  object: unknown,
  path: ReadonlyArray<string | number | symbol>,
  defaultValue?: T,
): T | undefined => {
  if (object === null || object === undefined) {
    return defaultValue;
  }

  const length = path.length;
  if (length === 0) {
    return object as T;
  }

  let current: unknown = object;

  for (let i = 0; i < length; i++) {
    if (current === null || current === undefined) {
      return defaultValue;
    }

    const key = path[i] as string | number | symbol;
    current = (current as Record<string | number | symbol, unknown>)[key];
  }

  return current === undefined ? defaultValue : (current as T);
};

export { get as default };

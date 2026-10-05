// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Returns one object with the properties of each object. A later property
 * with the same key wins. The merge is shallow; use `deepMerge` for nested
 * objects.
 *
 * @param instances - The objects
 * @returns A new object
 */
export const mergeObjects = <T>(
  ...instances: ReadonlyArray<Record<string | number | symbol, T>>
): Record<string | number | symbol, T> => {
  return Object.assign({}, ...instances);
};

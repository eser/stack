// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as ensureArray from "./ensure-array.ts";

/**
 * Returns the items of an iterable without the items at the given indexes.
 *
 * @param instance - The items
 * @param indexes - The indexes to remove
 * @returns A new array
 */
export const removeIndexFromArray = <T>(
  instance: Iterable<T>,
  ...indexes: ReadonlyArray<number>
): Array<T> => {
  const exclude = new Set(indexes);
  const arr = ensureArray.ensureArray(instance);
  const result: Array<T> = [];

  for (let i = 0, len = arr.length; i < len; i++) {
    if (!exclude.has(i)) {
      result.push(arr[i]!);
    }
  }

  return result;
};

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as ensureArray from "./ensure-array.ts";

/**
 * Returns the items of an iterable without the items equal to any of
 * `values`.
 *
 * @param instance - The items
 * @param values - The values to remove
 * @returns A new array
 */
export const removeValueFromArray = <T>(
  instance: Iterable<T>,
  ...values: ReadonlyArray<T>
): Array<T> => {
  const exclude = new Set(values);
  const arr = ensureArray.ensureArray(instance);
  const result: Array<T> = [];

  for (let i = 0, len = arr.length; i < len; i++) {
    const item = arr[i]!;
    if (!exclude.has(item)) {
      result.push(item);
    }
  }

  return result;
};

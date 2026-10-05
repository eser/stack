// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as ensureArray from "./ensure-array.ts";

/**
 * Returns the first `n` items of an iterable.
 *
 * @param instance - The items
 * @param n - How many items to take
 * @returns A new array
 */
export const takeFromArray = <T>(
  instance: Iterable<T>,
  n: number,
): Array<T> => {
  return ensureArray.ensureArray(instance).slice(0, n);
};

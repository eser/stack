// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as ensureArray from "./ensure-array.ts";

/**
 * Returns the items of an iterable without the first `n`.
 *
 * @param instance - The items
 * @param n - How many items to drop from the start
 * @returns A new array
 */
export const dropFromArray = <T>(
  instance: Iterable<T>,
  n: number,
): Array<T> => {
  return ensureArray.ensureArray(instance).slice(n);
};

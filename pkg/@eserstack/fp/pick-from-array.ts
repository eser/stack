// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as ensureArray from "./ensure-array.ts";

/** The items `pickFromArray` picked, and the rest. */
export type PickFromArrayResult<T> = { items: Array<T>; rest: Array<T> };

/**
 * Splits the items of an iterable into those that appear in `items` and the
 * rest, keeping their order.
 *
 * @param instance - The items
 * @param items - The values to pick
 * @returns The picked items and the rest
 */
export const pickFromArray = <T>(
  instance: Iterable<T>,
  items: Iterable<T>,
): PickFromArrayResult<T> => {
  const arrInstance = ensureArray.ensureArray(instance);
  const include = new Set(items);
  const picked: Array<T> = [];
  const rest: Array<T> = [];

  for (let i = 0, len = arrInstance.length; i < len; i++) {
    const value = arrInstance[i]!;
    if (include.has(value)) {
      picked.push(value);
    } else {
      rest.push(value);
    }
  }

  return { items: picked, rest };
};

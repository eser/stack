// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as ensureArray from "./ensure-array.ts";

/**
 * Returns the items of an iterable for which `predicate` returns `true`.
 *
 * @param instance - The items
 * @param predicate - Decides whether an item stays
 * @returns A new array
 */
export const filterArray = <T>(
  instance: Iterable<T>,
  predicate: (value: T, index: number, instance: Iterable<T>) => boolean,
): Array<T> => {
  return ensureArray.ensureArray(instance).filter(predicate);
};

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Builds an object from the items of an iterable, keyed by what `predicate`
 * returns for each item. An item whose key is `undefined` is left out, and a
 * later item with the same key replaces an earlier one.
 *
 * @param instance - The items
 * @param predicate - Returns the key for an item, or `undefined` to skip it
 * @returns A new object of the items by key
 *
 * @example
 * ```typescript
 * import * as fp from "@eserstack/fp";
 *
 * fp.associateArray([{ id: "a" }, { id: "b" }], (item) => item.id);
 * // { a: { id: "a" }, b: { id: "b" } }
 * ```
 */
export const associateArray = <T>(
  instance: Iterable<T>,
  predicate: (
    value: T,
    index: number,
    instance: Record<string | number | symbol, T>,
  ) => string | number | symbol | undefined,
): Record<string | number | symbol, T> => {
  const arrInstance = (instance.constructor === Array)
    ? instance as ReadonlyArray<T>
    : [...instance];

  const result: Record<string | number | symbol, T> = {};

  for (let i = 0, len = arrInstance.length; i < len; i++) {
    const value = arrInstance[i]!;
    const key = predicate(value, i, result);
    if (key !== undefined) {
      result[key] = value;
    }
  }

  return result;
};

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Creates an object composed of keys generated from the results of running
 * each element through iteratee. The corresponding value of each key is
 * the last element responsible for generating the key.
 *
 * @param array - The array to index
 * @param iteratee - Function that returns the key for each element
 * @returns Object with keys from iteratee and elements as values
 *
 * @example
 * ```typescript
 * import * as fp from "@eserstack/fp";
 *
 * const users = [{ id: "a", name: "Alice" }, { id: "b", name: "Bob" }];
 *
 * fp.keyBy(users, (x) => x.id);
 * // { a: { id: "a", name: "Alice" }, b: { id: "b", name: "Bob" } }
 *
 * // "two" replaces "one" at key 3
 * fp.keyBy(["one", "two", "three"], (x) => x.length); // { 3: "two", 5: "three" }
 * ```
 */
export const keyBy = <T, K extends string | number | symbol>(
  array: ReadonlyArray<T>,
  iteratee: (item: T) => K,
): Record<K, T> => {
  const result = {} as Record<K, T>;
  const length = array.length;

  for (let i = 0; i < length; i++) {
    const item = array[i] as T;
    const key = iteratee(item);
    result[key] = item;
  }

  return result;
};

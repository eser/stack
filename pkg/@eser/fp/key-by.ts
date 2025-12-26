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
 * keyBy([{id: 'a', name: 'Alice'}, {id: 'b', name: 'Bob'}], x => x.id)
 * // { a: {id: 'a', name: 'Alice'}, b: {id: 'b', name: 'Bob'} }
 *
 * keyBy(['one', 'two', 'three'], x => x.length)
 * // { 3: 'one', 5: 'three' } // 'two' overwrites 'one' at key 3, then 'three' at key 5
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

export { keyBy as default };

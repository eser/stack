// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Groups elements of an array by the result of an iteratee function.
 *
 * @param array - The array to group
 * @param iteratee - Function that returns the grouping key for each element
 * @returns Object with keys from iteratee and arrays of matching elements
 *
 * @example
 * groupBy([{type: 'a', v: 1}, {type: 'b', v: 2}, {type: 'a', v: 3}], x => x.type)
 * // { a: [{type: 'a', v: 1}, {type: 'a', v: 3}], b: [{type: 'b', v: 2}] }
 *
 * groupBy([1.2, 2.1, 2.4], Math.floor)
 * // { 1: [1.2], 2: [2.1, 2.4] }
 */
export const groupBy = <T, K extends string | number | symbol>(
  array: ReadonlyArray<T>,
  iteratee: (item: T) => K,
): Record<K, Array<T>> => {
  const result = {} as Record<K, Array<T>>;
  const length = array.length;

  for (let i = 0; i < length; i++) {
    const item = array[i] as T;
    const key = iteratee(item);

    if (result[key] === undefined) {
      result[key] = [item];
    } else {
      result[key].push(item);
    }
  }

  return result;
};

export { groupBy as default };

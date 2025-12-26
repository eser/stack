// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Splits an array into groups of the specified size.
 * If the array can't be split evenly, the final chunk will contain the remaining elements.
 *
 * @param array - The array to split into chunks
 * @param size - The size of each chunk (must be positive integer)
 * @returns Array of chunks
 *
 * @example
 * chunk([1, 2, 3, 4, 5], 2) // [[1, 2], [3, 4], [5]]
 * chunk([1, 2, 3, 4], 2)    // [[1, 2], [3, 4]]
 * chunk([], 2)              // []
 */
export const chunk = <T>(
  array: ReadonlyArray<T>,
  size: number,
): Array<Array<T>> => {
  if (size < 1) {
    return [];
  }

  const length = array.length;
  if (length === 0) {
    return [];
  }

  const chunkCount = Math.ceil(length / size);
  const result: Array<Array<T>> = new Array(chunkCount);

  for (let i = 0; i < chunkCount; i++) {
    const start = i * size;
    const end = Math.min(start + size, length);
    const chunk: Array<T> = new Array(end - start);

    for (let j = start; j < end; j++) {
      chunk[j - start] = array[j] as T;
    }

    result[i] = chunk;
  }

  return result;
};

export { chunk as default };

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Converts an Iterable to a ReadonlyArray.
 * If the instance is already an Array, returns it directly.
 * Otherwise, spreads it into a new array.
 *
 * @param instance - The iterable to convert
 * @returns A ReadonlyArray of the same type
 *
 * @example
 * ```typescript
 * const set = new Set([1, 2, 3]);
 * const arr = ensureArray(set); // [1, 2, 3]
 *
 * const existing = [1, 2, 3];
 * const same = ensureArray(existing); // same reference
 * ```
 */
export const ensureArray = <T>(instance: Iterable<T>): ReadonlyArray<T> =>
  instance.constructor === Array ? <ReadonlyArray<T>> instance : [...instance];

export { ensureArray as default };

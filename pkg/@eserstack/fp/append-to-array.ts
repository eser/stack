// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Returns a new array with `values` added after the items of `instance`.
 *
 * @param instance - The items to start from
 * @param values - The items to add at the end
 * @returns A new array
 *
 * @example
 * ```typescript
 * import * as fp from "@eserstack/fp";
 *
 * fp.appendToArray([1, 2], 3, 4); // [1, 2, 3, 4]
 * ```
 */
export const appendToArray = <T>(
  instance: Iterable<T>,
  ...values: ReadonlyArray<T>
): Array<T> => {
  return [...instance, ...values];
};

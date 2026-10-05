// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Returns an object without its first `n` properties, in property order.
 *
 * @param instance - The source object
 * @param n - How many properties to drop from the start
 * @returns A new object
 */
export const dropFromObject = <T>(
  instance: Record<string | number | symbol, T>,
  n: number,
): Record<string | number | symbol, T> => {
  return Object.fromEntries(Object.entries(instance).slice(n));
};

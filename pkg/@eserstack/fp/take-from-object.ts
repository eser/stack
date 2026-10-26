// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Returns an object with the first `n` properties of `instance`, in property
 * order.
 *
 * @param instance - The source object
 * @param n - How many properties to take
 * @returns A new object
 */
export const takeFromObject = <T>(
  instance: Record<string | number | symbol, T>,
  n: number,
): Record<string | number | symbol, T> => {
  return Object.fromEntries(Object.entries(instance).slice(0, n));
};

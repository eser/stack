// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Returns a copy of an object with the properties of `mapping` added or
 * replaced.
 *
 * @param instance - The source object
 * @param mapping - The properties to set
 * @returns A new object
 */
export const wth = <T>(
  instance: Record<string | number | symbol, T>,
  mapping: Record<string | number | symbol, T>,
): Record<string | number | symbol, T> => {
  return Object.assign({}, instance, mapping);
};

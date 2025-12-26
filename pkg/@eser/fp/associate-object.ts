// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export const associateObject = <T>(
  instance: Record<string | number | symbol, T>,
  predicate: (
    value: T,
    key: string | number | symbol,
    instance: Record<string | number | symbol, T>,
  ) => string | number | symbol | undefined,
): Record<string | number | symbol, T> => {
  const keys = Object.keys(instance);
  const result: Record<string | number | symbol, T> = {};

  for (let i = 0, len = keys.length; i < len; i++) {
    const itemKey = keys[i]!;
    const value = instance[itemKey] as T;
    const key = predicate(value, itemKey, instance);
    if (key !== undefined) {
      result[key] = value;
    }
  }

  return result;
};

export { associateObject as default };

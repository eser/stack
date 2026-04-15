// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export const removeValueFromObject = <T>(
  instance: Record<string | number | symbol, T>,
  ...values: ReadonlyArray<T>
): Record<string | number | symbol, T> => {
  const exclude = new Set(values);
  const keys = Object.keys(instance);
  const result: Record<string | number | symbol, T> = {};

  for (let i = 0, len = keys.length; i < len; i++) {
    const key = keys[i]!;
    const value = instance[key] as T;
    if (!exclude.has(value)) {
      result[key] = value;
    }
  }

  return result;
};

export { removeValueFromObject as default };

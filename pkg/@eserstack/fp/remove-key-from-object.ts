// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export const removeKeyFromObject = <T>(
  instance: Record<string | number | symbol, T>,
  ...keys: ReadonlyArray<string | number | symbol>
): Record<string | number | symbol, T> => {
  const exclude = new Set(keys);
  const instanceKeys = Object.keys(instance);
  const result: Record<string | number | symbol, T> = {};

  for (let i = 0, len = instanceKeys.length; i < len; i++) {
    const key = instanceKeys[i]!;
    if (!exclude.has(key)) {
      result[key] = instance[key] as T;
    }
  }

  return result;
};

export { removeKeyFromObject as default };

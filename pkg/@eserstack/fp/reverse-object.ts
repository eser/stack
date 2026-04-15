// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export const reverseObject = <T>(
  instance: Record<string | number | symbol, T>,
): Record<string | number | symbol, T> => {
  const keys = Object.keys(instance);
  const result: Record<string | number | symbol, T> = {};

  for (let i = keys.length - 1; i >= 0; i--) {
    const key = keys[i]!;
    result[key] = instance[key] as T;
  }

  return result;
};

export { reverseObject as default };

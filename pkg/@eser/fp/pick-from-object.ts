// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export type PickFromObjectResult<T> = {
  items: Record<string | number | symbol, T>;
  rest: Record<string | number | symbol, T>;
};

export const pickFromObject = <T>(
  instance: Record<string | number | symbol, T>,
  keys: ReadonlyArray<string | number | symbol>,
): PickFromObjectResult<T> => {
  const include = new Set(keys);
  const instanceKeys = Object.keys(instance);
  const items: Record<string | number | symbol, T> = {};
  const rest: Record<string | number | symbol, T> = {};

  for (let i = 0, len = instanceKeys.length; i < len; i++) {
    const key = instanceKeys[i]!;
    if (include.has(key)) {
      items[key] = instance[key] as T;
    } else {
      rest[key] = instance[key] as T;
    }
  }

  return { items, rest };
};

export { pickFromObject as default };

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export const mapObject = <T1, T2>(
  instance: Record<string | number | symbol, T1>,
  predicate: (
    value: T1,
    key: string | number | symbol,
    instance: Record<string | number | symbol, T1>,
  ) => Record<string | number | symbol, T2> | null,
): Record<string | number | symbol, T2> => {
  const keys = Object.keys(instance);
  const result: Record<string | number | symbol, T2> = {};

  for (let i = 0, len = keys.length; i < len; i++) {
    const key = keys[i]!;
    const mapped = predicate(instance[key] as T1, key, instance);
    if (mapped !== null) {
      Object.assign(result, mapped);
    }
  }

  return result;
};

export { mapObject as default };

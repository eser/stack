// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

export const mapObject = <T1, T2>(
  instance: Record<string | number | symbol, T1>,
  predicate: (
    value: T1,
    key: string | number | symbol,
    instance: Record<string | number | symbol, T1>,
  ) => Record<string | number | symbol, T2> | null,
): Record<string | number | symbol, T2> => {
  return Object.entries(instance).reduce(
    (obj, [itemKey, itemValue]) => {
      const value = predicate(itemValue, itemKey, obj);

      if (value !== null) {
        return { ...obj, ...value };
      }

      return obj;
    },
    {},
  );
};

export { mapObject as default };

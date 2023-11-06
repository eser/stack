// Copyright 2023 the cool authors. All rights reserved. Apache-2.0 license.

export const filterObject = <T>(
  instance: Record<string | number | symbol, T>,
  predicate: (
    value: T,
    key: string | number | symbol,
    instance: Record<string | number | symbol, T>,
  ) => boolean,
): Record<string | number | symbol, T> => {
  return Object.entries(instance).reduce(
    (obj, [itemKey, value]) => {
      if (predicate(value, itemKey, obj)) {
        return { ...obj, [itemKey]: value };
      }

      return obj;
    },
    {},
  );
};

export { filterObject as default };

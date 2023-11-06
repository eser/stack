// Copyright 2023 the cool authors. All rights reserved. Apache-2.0 license.

export const removeFirstMatchFromObject = <T>(
  instance: Record<string | number | symbol, T>,
  predicate: (
    value: T,
    key: string | number | symbol,
    instance: Record<string | number | symbol, T>,
  ) => boolean,
): Record<string | number | symbol, T> => {
  let notFound = true;

  return Object.entries(instance).reduce(
    (obj, [itemKey, value]) => {
      if (notFound && predicate(value, itemKey, obj)) {
        notFound = false;

        return obj;
      }

      return { ...obj, [itemKey]: value };
    },
    {},
  );
};

export { removeFirstMatchFromObject as default };

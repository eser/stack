// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

export const removeValueFromObject = <T>(
  instance: Record<string | number | symbol, T>,
  ...values: ReadonlyArray<T>
): Record<string | number | symbol, T> => {
  return Object.entries(instance).reduce(
    (obj, [itemKey, value]) => {
      if (values.indexOf(value) === -1) {
        return { ...obj, [itemKey]: value };
      }

      return obj;
    },
    {},
  );
};

export { removeValueFromObject as default };

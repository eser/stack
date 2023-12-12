// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

export const dropFromObject = <T>(
  instance: Record<string | number | symbol, T>,
  n: number,
): Record<string | number | symbol, T> => {
  const newKeys = Object.entries(instance).slice(n);

  return newKeys.reduce(
    (obj, [itemKey, value]) => {
      return { ...obj, [itemKey]: value };
    },
    {},
  );
};

export { dropFromObject as default };

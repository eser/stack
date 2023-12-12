// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

export const associateArray = <T>(
  instance: Iterable<T>,
  predicate: (
    value: T,
    index: number,
    instance: Record<string | number | symbol, T>,
  ) => string | number | symbol | undefined,
): Record<string | number | symbol, T> => {
  const arrInstance = (instance.constructor === Array)
    ? <ReadonlyArray<T>> instance
    : [...instance];

  return arrInstance.reduce(
    (obj, itemValue, itemIndex) => {
      const key = predicate(itemValue, itemIndex, obj);

      if (key !== undefined) {
        return {
          ...obj,
          [key]: itemValue,
        };
      }

      return obj;
    },
    {},
  );
};

export { associateArray as default };

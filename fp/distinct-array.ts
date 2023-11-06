// Copyright 2023 the cool authors. All rights reserved. Apache-2.0 license.

export const distinctArray = <T>(
  instance: Iterable<T>,
  predicate: (value: T, index: number, instance: Iterable<T>) => unknown,
): Array<T> => {
  const arrInstance = (instance.constructor === Array)
    ? <ReadonlyArray<T>> instance
    : [...instance];

  const predicateValue = predicate ?? ((value) => value);

  const result = arrInstance.reduce(
    (obj, itemValue, itemIndex) => {
      const key = predicateValue(itemValue, itemIndex, obj.items);

      if (obj.dict.has(key)) {
        return obj;
      }

      return {
        items: [...obj.items, itemValue],
        dict: new Set<unknown>([...obj.dict, key]),
      };
    },
    {
      items: <Array<T>> [],
      dict: new Set<unknown>(),
    },
  );

  return result.items;
};

export { distinctArray as default };

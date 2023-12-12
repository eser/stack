// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export type PickFromArrayResult<T> = { items: Array<T>; rest: Array<T> };

export const pickFromArray = <T>(
  instance: Iterable<T>,
  items: Iterable<T>,
): PickFromArrayResult<T> => {
  const arrInstance = (instance.constructor === Array)
    ? <ReadonlyArray<T>> instance
    : [...instance];

  const arrItems = (items.constructor === Array)
    ? <ReadonlyArray<T>> items
    : [...items];

  return arrInstance.reduce(
    (obj: PickFromArrayResult<T>, itemValue: T) => {
      if (arrItems.indexOf(itemValue) !== -1) {
        return {
          items: [...obj.items, itemValue],
          rest: obj.rest,
        };
      }

      return {
        items: obj.items,
        rest: [...obj.rest, itemValue],
      };
    },
    {
      items: [],
      rest: [],
    },
  );
};

export { pickFromArray as default };

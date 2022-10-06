type PickFromArrayResult<T> = { items: T[]; rest: T[] };

const pickFromArray = <T>(
  instance: Iterable<T>,
  items: Iterable<T>,
): PickFromArrayResult<T> => {
  const arrInstance = (instance.constructor === Array)
    ? <T[]> instance
    : [...instance];

  const arrItems = (items.constructor === Array) ? <T[]> items : [...items];

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

export { pickFromArray, pickFromArray as default };

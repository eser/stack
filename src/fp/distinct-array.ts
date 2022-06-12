function distinctArray<T>(
  instance: Iterable<T>,
  predicate: (value: T, index: number, instance: Iterable<T>) => unknown,
): T[] {
  const arrInstance = (instance.constructor === Array)
    ? <T[]> instance
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
      items: <T[]> [],
      dict: new Set<unknown>(),
    },
  );

  return result.items;
}

export { distinctArray, distinctArray as default };

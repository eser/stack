const distinctObject = <T>(
  instance: Record<string | number | symbol, T>,
  predicate: (
    value: T,
    key: string | number | symbol,
    instance: Record<string | number | symbol, T>,
  ) => unknown,
): Record<string | number | symbol, T> => {
  const predicateValue = predicate ?? ((value) => value);

  const result = Object.entries(instance).reduce(
    (obj, [itemKey, value]) => {
      const key = predicateValue(value, itemKey, obj.items);

      if (obj.dict.has(key)) {
        return obj;
      }

      return {
        items: { ...obj.items, [itemKey]: value },
        dict: new Set<unknown>([...obj.dict, key]),
      };
    },
    {
      items: {},
      dict: new Set<unknown>(),
    },
  );

  return result.items;
};

export { distinctObject, distinctObject as default };

function distinctObject<T>(
  instance: Record<string | number | symbol, T>,
  predicate: (
    value: T,
    key: string | number | symbol,
    instance: Record<string | number | symbol, T>,
  ) => unknown,
): Record<string | number | symbol, T> {
  const predicateValue = predicate ?? ((value) => value);

  const result = Object.keys(instance).reduce(
    (obj, itemKey) => {
      const key = predicateValue(instance[itemKey], itemKey, obj.items);

      if (obj.dict.has(key)) {
        return obj;
      }

      return {
        items: { ...obj.items, [itemKey]: instance[itemKey] },
        dict: new Set<unknown>([...obj.dict, key]),
      };
    },
    {
      items: {},
      dict: new Set<unknown>(),
    },
  );

  return result.items;
}

export { distinctObject, distinctObject as default };

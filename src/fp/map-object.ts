function mapObject<T1, T2>(
  instance: Record<string | number | symbol, T1>,
  predicate: (
    value: T1,
    key: string | number | symbol,
    instance: Record<string | number | symbol, T1>,
  ) => Record<string | number | symbol, T2> | null,
): Record<string | number | symbol, T2> {
  return Object.keys(instance).reduce(
    (obj, itemKey) => {
      const value = predicate(instance[itemKey], itemKey, obj);

      if (value !== null) {
        return { ...obj, ...value };
      }

      return obj;
    },
    {},
  );
}

export { mapObject, mapObject as default };

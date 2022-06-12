function associateObject<T>(
  instance: Record<string | number | symbol, T>,
  predicate: (
    value: T,
    key: string | number | symbol,
    instance: Record<string | number | symbol, T>,
  ) => string | number | symbol | undefined,
): Record<string | number | symbol, T> {
  return Object.keys(instance).reduce(
    (obj, itemKey) => {
      const key = predicate(instance[itemKey], itemKey, obj);

      if (key !== undefined) {
        return {
          ...obj,
          [key]: instance[itemKey],
        };
      }

      return obj;
    },
    {},
  );
}

export { associateObject, associateObject as default };

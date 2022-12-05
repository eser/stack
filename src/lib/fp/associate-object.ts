const associateObject = <T>(
  instance: Record<string | number | symbol, T>,
  predicate: (
    value: T,
    key: string | number | symbol,
    instance: Record<string | number | symbol, T>,
  ) => string | number | symbol | undefined,
): Record<string | number | symbol, T> => {
  return Object.entries(instance).reduce(
    (obj, [itemKey, value]) => {
      const key = predicate(value, itemKey, obj);

      if (key !== undefined) {
        return {
          ...obj,
          [key]: value,
        };
      }

      return obj;
    },
    {},
  );
};

export { associateObject, associateObject as default };

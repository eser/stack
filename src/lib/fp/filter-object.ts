function filterObject<T>(
  instance: Record<string | number | symbol, T>,
  predicate: (
    value: T,
    key: string | number | symbol,
    instance: Record<string | number | symbol, T>,
  ) => boolean,
): Record<string | number | symbol, T> {
  return Object.keys(instance).reduce(
    (obj, itemKey) => {
      if (predicate(instance[itemKey], itemKey, obj)) {
        return { ...obj, [itemKey]: instance[itemKey] };
      }

      return obj;
    },
    {},
  );
}

export { filterObject, filterObject as default };

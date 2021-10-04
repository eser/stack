function filterObject<T>(
  instance: Record<string | symbol, T>,
  predicate: (
    value: T,
    key: string | symbol,
    instance: Record<string | symbol, T>,
  ) => boolean,
): Record<string | symbol, T> {
  return Object.keys(instance).reduce(
    (obj, itemKey) => {
      if (predicate(instance[itemKey], itemKey, obj)) {
        return Object.assign({}, obj, {
          [itemKey]: instance[itemKey],
        });
      }

      return obj;
    },
    {},
  );
}

export { filterObject as default };

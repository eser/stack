function filterObject<T>(
  instance: Record<string, T>,
  predicate: (
    value: T,
    key: string,
    instance: Record<string, T>,
  ) => boolean,
): Record<string, T> {
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

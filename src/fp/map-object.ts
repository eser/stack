function mapObject<T>(
  instance: Record<string, T>,
  predicate: (
    value: T,
    key: string,
    instance: Record<string, T>,
  ) => Record<string, T> | null,
): Record<string, T> {
  return Object.keys(instance).reduce(
    (obj, itemKey) => {
      const value = predicate(instance[itemKey], itemKey, obj);

      if (value !== null) {
        return Object.assign({}, obj, value);
      }

      return obj;
    },
    {},
  );
}

export { mapObject as default };

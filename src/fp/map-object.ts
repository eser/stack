function mapObject<T1, T2>(
  instance: Record<string, T1>,
  predicate: (
    value: T1,
    key: string,
    instance: Record<string, T1>,
  ) => Record<string, T2> | null,
): Record<string, T2> {
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

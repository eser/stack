function takeFromObject<T>(
  instance: Record<string, T>,
  n: number,
): Record<string, T> {
  const newKeys = Object.keys(instance).slice(0, n);

  return newKeys.reduce(
    (obj, itemKey) => {
      return Object.assign({}, obj, {
        [itemKey]: instance[itemKey],
      });
    },
    {},
  );
}

export { takeFromObject as default };

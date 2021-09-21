function dropFromObject<T>(
  instance: Record<string, T>,
  n: number,
): Record<string, T> {
  const newKeys = Object.keys(instance).slice(n);

  return newKeys.reduce(
    (obj, itemKey) => {
      return Object.assign({}, obj, {
        [itemKey]: instance[itemKey],
      });
    },
    {},
  );
}

export { dropFromObject as default };

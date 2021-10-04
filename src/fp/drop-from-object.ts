function dropFromObject<T>(
  instance: Record<string | symbol, T>,
  n: number,
): Record<string | symbol, T> {
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

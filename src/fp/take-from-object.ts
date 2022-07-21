function takeFromObject<T>(
  instance: Record<string | number | symbol, T>,
  n: number,
): Record<string | number | symbol, T> {
  const newKeys = Object.keys(instance).slice(0, n);

  return newKeys.reduce(
    (obj, itemKey) => {
      return { ...obj, [itemKey]: instance[itemKey] };
    },
    {},
  );
}

export { takeFromObject, takeFromObject as default };

function takeFromObject<T>(
  instance: Record<string | number | symbol, T>,
  n: number,
): Record<string | number | symbol, T> {
  const newKeys = Object.entries(instance).slice(0, n);

  return newKeys.reduce(
    (obj, [itemKey, value]) => {
      return { ...obj, [itemKey]: value };
    },
    {},
  );
}

export { takeFromObject, takeFromObject as default };

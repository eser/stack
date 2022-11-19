function dropFromObject<T>(
  instance: Record<string | number | symbol, T>,
  n: number,
): Record<string | number | symbol, T> {
  const newKeys = Object.keys(instance).slice(n);

  return newKeys.reduce(
    (obj, itemKey) => {
      return { ...obj, [itemKey]: instance[itemKey] };
    },
    {},
  );
}

export { dropFromObject, dropFromObject as default };

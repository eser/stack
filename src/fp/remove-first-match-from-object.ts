function removeFirstMatchFromObject<T>(
  instance: Record<string | number | symbol, T>,
  predicate: (
    value: T,
    key: string | number | symbol,
    instance: Record<string | number | symbol, T>,
  ) => boolean,
): Record<string | number | symbol, T> {
  let notFound = true;

  return Object.keys(instance).reduce(
    (obj, itemKey) => {
      if (notFound && predicate(instance[itemKey], itemKey, obj)) {
        notFound = false;

        return obj;
      }

      return Object.assign({}, obj, {
        [itemKey]: instance[itemKey],
      });
    },
    {},
  );
}

export { removeFirstMatchFromObject, removeFirstMatchFromObject as default };

function removeFirstMatchFromObject<T>(
  instance: Record<string | symbol, T>,
  predicate: (
    value: T,
    key: string | symbol,
    instance: Record<string | symbol, T>,
  ) => boolean,
): Record<string | symbol, T> {
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

export { removeFirstMatchFromObject as default };

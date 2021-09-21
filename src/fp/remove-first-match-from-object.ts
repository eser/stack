function removeFirstMatchFromObject<T>(
  instance: Record<string, T>,
  predicate: (value: T, key: string, instance: Record<string, T>) => boolean,
): Record<string, T> {
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

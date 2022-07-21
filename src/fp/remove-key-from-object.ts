function removeKeyFromObject<T>(
  instance: Record<string | number | symbol, T>,
  ...keys: (string | number | symbol)[]
): Record<string | number | symbol, T> {
  return Object.keys(instance).reduce(
    (obj, itemKey) => {
      if (keys.indexOf(itemKey) === -1) {
        return { ...obj, [itemKey]: instance[itemKey] };
      }

      return obj;
    },
    {},
  );
}

export { removeKeyFromObject, removeKeyFromObject as default };

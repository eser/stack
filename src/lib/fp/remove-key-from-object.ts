const removeKeyFromObject = <T>(
  instance: Record<string | number | symbol, T>,
  ...keys: (string | number | symbol)[]
): Record<string | number | symbol, T> => {
  return Object.entries(instance).reduce(
    (obj, [itemKey, value]) => {
      if (keys.indexOf(itemKey) === -1) {
        return { ...obj, [itemKey]: value };
      }

      return obj;
    },
    {},
  );
};

export { removeKeyFromObject, removeKeyFromObject as default };

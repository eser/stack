export const removeKeyFromObject = <T>(
  instance: Record<string | number | symbol, T>,
  ...keys: ReadonlyArray<string | number | symbol>
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

export { removeKeyFromObject as default };

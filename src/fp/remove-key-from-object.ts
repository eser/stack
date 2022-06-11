function removeKeyFromObject<T>(
  instance: Record<string | symbol, T>,
  ...keys: Array<string | symbol>
): Record<string | symbol, T> {
  return Object.keys(instance).reduce(
    (obj, itemKey) => {
      if (keys.indexOf(itemKey) === -1) {
        return Object.assign({}, obj, {
          [itemKey]: instance[itemKey],
        });
      }

      return obj;
    },
    {},
  );
}

export { removeKeyFromObject, removeKeyFromObject as default };

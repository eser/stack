function removeKeyFromObject<T>(
  instance: Record<string, T>,
  ...keys: Array<string>
): Record<string, T> {
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

export { removeKeyFromObject as default };

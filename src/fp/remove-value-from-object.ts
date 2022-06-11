function removeValueFromObject<T>(
  instance: Record<string | symbol, T>,
  ...values: Array<T>
): Record<string | symbol, T> {
  return Object.keys(instance).reduce(
    (obj, itemKey) => {
      if (values.indexOf(instance[itemKey]) === -1) {
        return Object.assign({}, obj, {
          [itemKey]: instance[itemKey],
        });
      }

      return obj;
    },
    {},
  );
}

export { removeValueFromObject, removeValueFromObject as default };

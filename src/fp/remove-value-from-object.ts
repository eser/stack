function removeValueFromObject<T>(
  instance: Record<string, T>,
  ...values: Array<T>
): Record<string, T> {
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

export { removeValueFromObject as default };

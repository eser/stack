function removeValueFromObject<T>(
  instance: Record<string | number | symbol, T>,
  ...values: T[]
): Record<string | number | symbol, T> {
  return Object.keys(instance).reduce(
    (obj, itemKey) => {
      if (values.indexOf(instance[itemKey]) === -1) {
        return { ...obj, [itemKey]: instance[itemKey] };
      }

      return obj;
    },
    {},
  );
}

export { removeValueFromObject, removeValueFromObject as default };

function wthout<T>(
  instance: Record<string | number | symbol, T>,
  fields: (string | number | symbol)[],
): Record<string | number | symbol, T> {
  return Object.entries(instance).reduce(
    (obj, [itemKey, value]) => {
      if (fields.indexOf(itemKey) === -1) {
        return { ...obj, [itemKey]: value };
      }

      return obj;
    },
    {},
  );
}

export { wthout, wthout as default };

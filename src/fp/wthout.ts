function wthout<T>(
  instance: Record<string | number | symbol, T>,
  fields: (string | number | symbol)[],
): Record<string | number | symbol, T> {
  return Object.keys(instance).reduce(
    (obj, itemKey) => {
      if (fields.indexOf(itemKey) === -1) {
        return { ...obj, [itemKey]: instance[itemKey] };
      }

      return obj;
    },
    {},
  );
}

export { wthout, wthout as default };

const reverseObject = <T>(
  instance: Record<string | number | symbol, T>,
): Record<string | number | symbol, T> => {
  return Object.entries(instance).reduce(
    (obj, [itemKey, value]) => ({ [itemKey]: value, ...obj }),
    {},
  );
};

export { reverseObject, reverseObject as default };

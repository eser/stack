function reverseObject<T>(instance: Record<string, T>): Record<string, T> {
  return Object.keys(instance).reduce(
    (obj, itemKey) => Object.assign({}, { [itemKey]: instance[itemKey] }, obj),
    {},
  );
}

export { reverseObject as default };

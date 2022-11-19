function mergeObjects<T>(
  ...instances: Record<string | number | symbol, T>[]
): Record<string | number | symbol, T> {
  return Object.assign({}, ...instances);
}

export { mergeObjects, mergeObjects as default };

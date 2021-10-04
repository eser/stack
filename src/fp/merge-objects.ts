function mergeObjects<T>(
  ...instances: Array<Record<string | symbol, T>>
): Record<string | symbol, T> {
  return Object.assign({}, ...instances);
}

export { mergeObjects as default };

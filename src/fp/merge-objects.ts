function mergeObjects<T>(
  ...instances: Array<Record<string, T>>
): Record<string, T> {
  return Object.assign({}, ...instances);
}

export { mergeObjects as default };

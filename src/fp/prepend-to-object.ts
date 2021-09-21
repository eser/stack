function prependToObject<T>(
  instance: Record<string, T>,
  ...values: Array<Record<string, T>>
): Record<string, T> {
  return Object.assign({}, ...values, instance);
}

export { prependToObject as default };

function appendToObject<T>(
  instance: Record<string, T>,
  ...values: Array<Record<string, T>>
): Record<string, T> {
  return Object.assign({}, instance, ...values);
}

export { appendToObject as default };

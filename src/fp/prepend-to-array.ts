function prependToArray<T>(
  instance: Iterable<T>,
  ...values: Array<T>
): Array<T> {
  return [...values, ...instance];
}

export { prependToArray as default };

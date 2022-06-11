function appendToArray<T>(
  instance: Iterable<T>,
  ...values: Array<T>
): Array<T> {
  return [...instance, ...values];
}

export { appendToArray, appendToArray as default };

function removeValueFromArray<T>(
  instance: Iterable<T>,
  ...values: Array<T>
): Array<T> {
  const arrInstance = (instance.constructor === Array)
    ? <Array<T>> instance
    : [...instance];

  return arrInstance.filter(
    (item) => values.indexOf(item) === -1,
  );
}

export { removeValueFromArray, removeValueFromArray as default };

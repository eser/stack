function mapArray<T>(
  instance: Iterable<T>,
  predicate: (value: T, index: number, instance: Iterable<T>) => T,
): Array<T> {
  const arrInstance = (instance.constructor === Array)
    ? <Array<T>> instance
    : [...instance];

  return arrInstance.map(predicate);
}

export { mapArray as default };

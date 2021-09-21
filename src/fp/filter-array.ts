function filterArray<T>(
  instance: Iterable<T>,
  predicate: (value: T, index: number, instance: Iterable<T>) => boolean,
): Array<T> {
  const arrInstance = (instance.constructor === Array)
    ? <Array<T>> instance
    : [...instance];

  return arrInstance.filter(predicate);
}

export { filterArray as default };

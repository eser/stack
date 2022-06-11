function takeFromArray<T>(instance: Iterable<T>, n: number): Array<T> {
  const arrInstance = (instance.constructor === Array)
    ? <Array<T>> instance
    : [...instance];

  return arrInstance.slice(0, n);
}

export { takeFromArray, takeFromArray as default };

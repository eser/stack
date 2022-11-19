function takeFromArray<T>(instance: Iterable<T>, n: number): T[] {
  const arrInstance = (instance.constructor === Array)
    ? <T[]> instance
    : [...instance];

  return arrInstance.slice(0, n);
}

export { takeFromArray, takeFromArray as default };

type SplitArrayResult<T> = { items: Array<T>; rest: Array<T> };

function splitArray<T>(
  instance: Iterable<T>,
  n: number,
): SplitArrayResult<T> {
  const arrInstance = (instance.constructor === Array)
    ? <Array<T>> instance
    : [...instance];

  // take n items
  return {
    items: arrInstance.slice(0, n),
    rest: arrInstance.slice(n),
  };
}

export { splitArray as default };

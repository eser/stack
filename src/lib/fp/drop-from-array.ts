const dropFromArray = <T>(instance: Iterable<T>, n: number): T[] => {
  const arrInstance = (instance.constructor === Array)
    ? <T[]> instance
    : [...instance];

  return arrInstance.slice(n);
};

export { dropFromArray, dropFromArray as default };

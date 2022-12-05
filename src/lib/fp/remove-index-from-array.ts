const removeIndexFromArray = <T>(
  instance: Iterable<T>,
  ...indexes: number[]
): T[] => {
  const arrInstance = (instance.constructor === Array)
    ? <T[]> instance
    : [...instance];

  return arrInstance.filter(
    (_, index) => indexes.indexOf(index) === -1,
  );
};

export { removeIndexFromArray, removeIndexFromArray as default };

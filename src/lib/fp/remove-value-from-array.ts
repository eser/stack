const removeValueFromArray = <T>(
  instance: Iterable<T>,
  ...values: T[]
): T[] => {
  const arrInstance = (instance.constructor === Array)
    ? <T[]> instance
    : [...instance];

  return arrInstance.filter(
    (item) => values.indexOf(item) === -1,
  );
};

export { removeValueFromArray, removeValueFromArray as default };

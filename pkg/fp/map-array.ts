export const mapArray = <T1, T2>(
  instance: Iterable<T1>,
  predicate: (value: T1, index: number, instance: Iterable<T1>) => T2,
): T2[] => {
  const arrInstance = (instance.constructor === Array)
    ? <T1[]> instance
    : [...instance];

  return arrInstance.map(predicate);
};

export { mapArray as default };

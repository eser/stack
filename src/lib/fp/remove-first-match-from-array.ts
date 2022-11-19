function removeFirstMatchFromArray<T>(
  instance: Iterable<T>,
  predicate: (value: T, index: number, instance: Iterable<T>) => boolean,
): T[] {
  const arrInstance = (instance.constructor === Array)
    ? <T[]> instance
    : [...instance];

  let notFound = true;

  return arrInstance.filter((itemValue, itemKey, obj) => {
    if (notFound && predicate(itemValue, itemKey, obj)) {
      notFound = false;

      return false;
    }

    return true;
  });
}

export { removeFirstMatchFromArray, removeFirstMatchFromArray as default };

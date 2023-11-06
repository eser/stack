// Copyright 2023 the cool authors. All rights reserved. Apache-2.0 license.

export const removeIndexFromArray = <T>(
  instance: Iterable<T>,
  ...indexes: ReadonlyArray<number>
): Array<T> => {
  const arrInstance = (instance.constructor === Array)
    ? <ReadonlyArray<T>> instance
    : [...instance];

  return arrInstance.filter(
    (_, index) => indexes.indexOf(index) === -1,
  );
};

export { removeIndexFromArray as default };

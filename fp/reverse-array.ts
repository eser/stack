// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

export const reverseArray = <T>(instance: Iterable<T>): Array<T> => {
  const arrInstance = (instance.constructor === Array)
    ? <ReadonlyArray<T>> instance
    : [...instance];

  return arrInstance.reduce(
    (obj: ReadonlyArray<T>, itemValue: T) => [itemValue, ...obj],
    [],
  );
};

export { reverseArray as default };

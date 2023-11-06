// Copyright 2023 the cool authors. All rights reserved. Apache-2.0 license.

export const dropFromArray = <T>(
  instance: Iterable<T>,
  n: number,
): Array<T> => {
  const arrInstance = (instance.constructor === Array)
    ? <ReadonlyArray<T>> instance
    : [...instance];

  return arrInstance.slice(n);
};

export { dropFromArray as default };

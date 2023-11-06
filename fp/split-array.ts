// Copyright 2023 the cool authors. All rights reserved. Apache-2.0 license.

export type SplitArrayResult<T> = { items: Array<T>; rest: Array<T> };

export const splitArray = <T>(
  instance: Iterable<T>,
  n: number,
): SplitArrayResult<T> => {
  const arrInstance = (instance.constructor === Array)
    ? <ReadonlyArray<T>> instance
    : [...instance];

  // take n items
  return {
    items: arrInstance.slice(0, n),
    rest: arrInstance.slice(n),
  };
};

export { splitArray as default };

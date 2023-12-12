// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

export const removeValueFromArray = <T>(
  instance: Iterable<T>,
  ...values: ReadonlyArray<T>
): Array<T> => {
  const arrInstance = (instance.constructor === Array)
    ? <ReadonlyArray<T>> instance
    : [...instance];

  return arrInstance.filter(
    (item) => values.indexOf(item) === -1,
  );
};

export { removeValueFromArray as default };

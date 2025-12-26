// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export const associateArray = <T>(
  instance: Iterable<T>,
  predicate: (
    value: T,
    index: number,
    instance: Record<string | number | symbol, T>,
  ) => string | number | symbol | undefined,
): Record<string | number | symbol, T> => {
  const arrInstance = (instance.constructor === Array)
    ? <ReadonlyArray<T>> instance
    : [...instance];

  const result: Record<string | number | symbol, T> = {};

  for (let i = 0, len = arrInstance.length; i < len; i++) {
    const value = arrInstance[i]!;
    const key = predicate(value, i, result);
    if (key !== undefined) {
      result[key] = value;
    }
  }

  return result;
};

export { associateArray as default };

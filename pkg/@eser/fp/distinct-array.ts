// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export const distinctArray = <T>(
  instance: Iterable<T>,
  predicate: (value: T, index: number, instance: Iterable<T>) => unknown,
): Array<T> => {
  const arrInstance = (instance.constructor === Array)
    ? <ReadonlyArray<T>> instance
    : [...instance];

  const predicateValue = predicate ?? ((value: T) => value);
  const result: Array<T> = [];
  const seen = new Set<unknown>();

  for (let i = 0, len = arrInstance.length; i < len; i++) {
    const value = arrInstance[i]!;
    const key = predicateValue(value, i, result);

    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  }

  return result;
};

export { distinctArray as default };

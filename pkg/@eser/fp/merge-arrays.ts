// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export const mergeArrays = <T>(
  ...instances: ReadonlyArray<Iterable<T>>
): Array<T> => {
  return instances.reduce<Array<T>>(
    (obj, instance) => [...obj, ...instance],
    [],
  );
};

export { mergeArrays as default };

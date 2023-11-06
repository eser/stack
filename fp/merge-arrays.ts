// Copyright 2023 the cool authors. All rights reserved. Apache-2.0 license.

export const mergeArrays = <T>(
  ...instances: ReadonlyArray<Iterable<T>>
): Array<T> => {
  return instances.reduce(
    (obj: ReadonlyArray<T>, instance: Iterable<T>) => [...obj, ...instance],
    [],
  );
};

export { mergeArrays as default };

// Copyright 2023 the cool authors. All rights reserved. Apache-2.0 license.

export const prependToArray = <T>(
  instance: Iterable<T>,
  ...values: ReadonlyArray<T>
): Array<T> => {
  return [...values, ...instance];
};

export { prependToArray as default };

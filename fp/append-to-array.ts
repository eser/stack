// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

export const appendToArray = <T>(
  instance: Iterable<T>,
  ...values: ReadonlyArray<T>
): Array<T> => {
  return [...instance, ...values];
};

export { appendToArray as default };

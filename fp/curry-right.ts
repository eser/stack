// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

export const curryRight = <T1, T2, T3>(
  func: (...args: readonly [...ReadonlyArray<T1>, ...ReadonlyArray<T2>]) => T3,
  ...args: ReadonlyArray<T2>
): (...args: ReadonlyArray<T1>) => T3 => {
  return (...args2: ReadonlyArray<T1>) => func(...args2, ...args);
};

export { curryRight as default };

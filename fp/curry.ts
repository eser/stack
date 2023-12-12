// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export const curry = <T1, T2, T3>(
  func: (...args: readonly [...ReadonlyArray<T1>, ...ReadonlyArray<T2>]) => T3,
  ...args: ReadonlyArray<T1>
): (...args: ReadonlyArray<T2>) => T3 => {
  return (...args2: ReadonlyArray<T2>) => func(...args, ...args2);
};

export { curry as default };

// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

export type Decorated<T1, T2> = (...args: ReadonlyArray<T1>) => T2;

export const decorate = <T1, T2>(
  target: Decorated<T1, T2>,
  decorator: (
    ...args: readonly [Decorated<T1, T2>, ...ReadonlyArray<T1>]
  ) => T2,
) => {
  return (...args: ReadonlyArray<T1>): T2 => {
    return decorator(target, ...args);
  };
};

export { decorate as default };

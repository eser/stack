// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/** A function that takes arguments of one type and returns another. */
export type Decorated<T1, T2> = (...args: ReadonlyArray<T1>) => T2;

/**
 * Wraps a function with a decorator. Each call runs `decorator` with the
 * original function first and the call's arguments after it.
 *
 * @param target - The function to wrap
 * @param decorator - Receives `target` and the arguments, and returns the
 *   result
 * @returns The wrapped function
 */
export const decorate = <T1, T2>(
  target: Decorated<T1, T2>,
  decorator: (
    ...args: readonly [Decorated<T1, T2>, ...ReadonlyArray<T1>]
  ) => T2,
): ((...args: ReadonlyArray<T1>) => T2) => {
  return (...args: ReadonlyArray<T1>): T2 => {
    return decorator(target, ...args);
  };
};

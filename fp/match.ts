// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export type Callback<T> = () => T;
export type Pattern<T> = [unknown, Callback<T>];

export const match = <T>(
  value: unknown,
  patterns: ReadonlyArray<Pattern<T>>,
  otherwise?: Callback<T>,
): T | undefined => {
  const pattern = patterns.find((x) => value === x[0]);

  if (pattern === undefined) {
    return otherwise?.();
  }

  return pattern[1]?.();
};

export { match as default };

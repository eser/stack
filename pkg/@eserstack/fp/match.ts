// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/** Produces the result of a matched pattern. */
export type Callback<T> = () => T;
/** A value to compare against and the callback for a match. */
export type Pattern<T> = [unknown, Callback<T>];

/**
 * Runs the callback of the first pattern whose value is strictly equal to
 * `value`, or `otherwise` when none is.
 *
 * @param value - The value to match
 * @param patterns - Values and their callbacks, tried in order
 * @param otherwise - Called when no pattern matches
 * @returns The callback's result, or `undefined` when nothing matched and
 *   there is no `otherwise`
 */
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

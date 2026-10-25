// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type * as promises from "@eserstack/primitives/promises";
import type * as functions from "@eserstack/primitives/functions";

/**
 * Calls `func` for each value of an iterable, one at a time, waiting for each
 * call before the next. The iterable may be a promise.
 *
 * @param iterable - The values, or a promise of them
 * @param func - Called with each value
 * @returns A promise that resolves when every call has finished
 */
export const iterate = async (
  // oxlint-disable-next-line typescript/no-explicit-any
  iterable: promises.Promisable<Iterable<any>>,
  // oxlint-disable-next-line typescript/no-explicit-any
  func: (...args: functions.ArgList<any>) => promises.Promisable<any>,
): Promise<void> => {
  for (const value of await iterable) {
    // func runs for one value at a time, in iteration order, so it can update
    // shared state without racing the next call.
    // oxlint-disable-next-line no-await-in-loop
    await func(value);
  }
};

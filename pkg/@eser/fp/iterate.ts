// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as promises from "@eser/standards/promises";
import * as functions from "@eser/standards/functions";

export const iterate = async (
  // deno-lint-ignore no-explicit-any
  iterable: promises.Promisable<Iterable<any>>,
  // deno-lint-ignore no-explicit-any
  func: (...args: functions.ArgList<any>) => promises.Promisable<any>,
): Promise<void> => {
  for (const value of await iterable) {
    await func(value);
  }
};

export { iterate as default };

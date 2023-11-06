// Copyright 2023 the cool authors. All rights reserved. Apache-2.0 license.

import { type Promisable } from "../standards/promises.ts";
import { type ArgList } from "../standards/functions.ts";

export const iterate = async (
  // deno-lint-ignore no-explicit-any
  iterable: Promisable<Iterable<any>>,
  // deno-lint-ignore no-explicit-any
  func: (...args: ArgList) => Promisable<any>,
): Promise<void> => {
  for (const value of await iterable) {
    await func(value);
  }
};

export { iterate as default };

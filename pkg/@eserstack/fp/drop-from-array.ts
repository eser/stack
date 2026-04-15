// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { ensureArray } from "./ensure-array.ts";

export const dropFromArray = <T>(
  instance: Iterable<T>,
  n: number,
): Array<T> => {
  return ensureArray(instance).slice(n);
};

export { dropFromArray as default };

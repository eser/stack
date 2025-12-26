// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { ensureArray } from "./ensure-array.ts";

export const removeIndexFromArray = <T>(
  instance: Iterable<T>,
  ...indexes: ReadonlyArray<number>
): Array<T> => {
  const exclude = new Set(indexes);
  const arr = ensureArray(instance);
  const result: Array<T> = [];

  for (let i = 0, len = arr.length; i < len; i++) {
    if (!exclude.has(i)) {
      result.push(arr[i]!);
    }
  }

  return result;
};

export { removeIndexFromArray as default };

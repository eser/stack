// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { ensureArray } from "./ensure-array.ts";

export const removeValueFromArray = <T>(
  instance: Iterable<T>,
  ...values: ReadonlyArray<T>
): Array<T> => {
  const exclude = new Set(values);
  const arr = ensureArray(instance);
  const result: Array<T> = [];

  for (let i = 0, len = arr.length; i < len; i++) {
    const item = arr[i]!;
    if (!exclude.has(item)) {
      result.push(item);
    }
  }

  return result;
};

export { removeValueFromArray as default };

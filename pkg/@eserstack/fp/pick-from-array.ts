// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { ensureArray } from "./ensure-array.ts";

export type PickFromArrayResult<T> = { items: Array<T>; rest: Array<T> };

export const pickFromArray = <T>(
  instance: Iterable<T>,
  items: Iterable<T>,
): PickFromArrayResult<T> => {
  const arrInstance = ensureArray(instance);
  const include = new Set(items);
  const picked: Array<T> = [];
  const rest: Array<T> = [];

  for (let i = 0, len = arrInstance.length; i < len; i++) {
    const value = arrInstance[i]!;
    if (include.has(value)) {
      picked.push(value);
    } else {
      rest.push(value);
    }
  }

  return { items: picked, rest };
};

export { pickFromArray as default };

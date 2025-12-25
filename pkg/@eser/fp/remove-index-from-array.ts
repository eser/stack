// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { ensureArray } from "./ensure-array.ts";

export const removeIndexFromArray = <T>(
  instance: Iterable<T>,
  ...indexes: ReadonlyArray<number>
): Array<T> => {
  return ensureArray(instance).filter(
    (_, index) => indexes.indexOf(index) === -1,
  );
};

export { removeIndexFromArray as default };

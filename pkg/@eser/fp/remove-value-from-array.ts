// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { ensureArray } from "./ensure-array.ts";

export const removeValueFromArray = <T>(
  instance: Iterable<T>,
  ...values: ReadonlyArray<T>
): Array<T> => {
  return ensureArray(instance).filter(
    (item) => values.indexOf(item) === -1,
  );
};

export { removeValueFromArray as default };

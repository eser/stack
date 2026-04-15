// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { deepCopy } from "./deep-copy.ts";

export const mutate = <T extends object>(
  instance: T,
  mutator: (draft: T) => void,
): T => {
  const newInstance = deepCopy(instance);

  mutator(newInstance);

  // return deepCopy(newInstance);
  return newInstance;
};

export { mutate as default };

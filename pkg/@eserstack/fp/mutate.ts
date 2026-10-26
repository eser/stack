// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as deepCopy from "./deep-copy.ts";

/**
 * Returns a changed copy of an object: `mutator` edits a deep copy, and the
 * original stays as it was.
 *
 * @param instance - The object to copy
 * @param mutator - Edits the copy in place
 * @returns The edited copy
 * @throws {DeepCopyError} When the object has a circular reference or is
 *   nested too deep to copy
 */
export const mutate = <T extends object>(
  instance: T,
  mutator: (draft: T) => void,
): T => {
  const newInstance = deepCopy.deepCopy(instance);

  mutator(newInstance);

  return newInstance;
};

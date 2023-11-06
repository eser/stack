// Copyright 2023 the cool authors. All rights reserved. Apache-2.0 license.

export const mergeObjects = <T>(
  ...instances: ReadonlyArray<Record<string | number | symbol, T>>
): Record<string | number | symbol, T> => {
  return Object.assign({}, ...instances);
};

export { mergeObjects as default };

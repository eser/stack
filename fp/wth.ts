// Copyright 2023 the cool authors. All rights reserved. Apache-2.0 license.

export const wth = <T>(
  instance: Record<string | number | symbol, T>,
  mapping: Record<string | number | symbol, T>,
): Record<string | number | symbol, T> => {
  return Object.assign({}, instance, mapping);
};

export { wth as default };

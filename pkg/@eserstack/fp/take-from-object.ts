// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export const takeFromObject = <T>(
  instance: Record<string | number | symbol, T>,
  n: number,
): Record<string | number | symbol, T> => {
  return Object.fromEntries(Object.entries(instance).slice(0, n));
};

export { takeFromObject as default };

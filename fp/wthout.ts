// Copyright 2023 the cool authors. All rights reserved. Apache-2.0 license.

type Key = string | number | symbol;

export const wthout = <T>(
  instance: Record<Key, T>,
  ...fields: ReadonlyArray<Key>
): Record<Key, T> => {
  return Object.entries(instance).reduce<Record<Key, T>>(
    (obj, [itemKey, value]) => {
      if (fields.indexOf(itemKey) === -1) {
        obj[itemKey] = value;
      }

      return obj;
    },
    {},
  );
};

export { wthout as default };

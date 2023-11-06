// Copyright 2023 the cool authors. All rights reserved. Apache-2.0 license.

export type PickFromObjectResult<T> = {
  items: Record<string | number | symbol, T>;
  rest: Record<string | number | symbol, T>;
};

export const pickFromObject = <T>(
  instance: Record<string | number | symbol, T>,
  keys: ReadonlyArray<string | number | symbol>,
): PickFromObjectResult<T> => {
  return Object.entries(instance).reduce(
    (obj, [itemKey, value]) => {
      if (keys.indexOf(itemKey) !== -1) {
        return {
          items: { ...obj.items, [itemKey]: value },
          rest: obj.rest,
        };
      }

      return {
        items: obj.items,
        rest: { ...obj.rest, [itemKey]: value },
      };
    },
    {
      items: {},
      rest: {},
    },
  );
};

export { pickFromObject as default };

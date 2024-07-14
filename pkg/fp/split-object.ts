// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export type SplitObjectResult<T> = {
  items: Record<string | number | symbol, T>;
  rest: Record<string | number | symbol, T>;
};

/**
 * The `splitObject` function splits an object into two parts based on a given number, with the first
 * part containing the specified number of items and the second part containing the remaining items.
 * @param instance - The `instance` parameter is an object with keys of type `string`, `number`, or
 * `symbol`, and values of type `T`.
 * @param {number} n - The parameter `n` represents the number of items you want to split from the
 * object.
 * @returns The function `splitObject` returns an object of type `SplitObjectResult<T>`.
 */
export const splitObject = <T>(
  instance: Record<string | number | symbol, T>,
  n: number,
): SplitObjectResult<T> => {
  let index = 0;

  return Object.keys(instance).reduce(
    (obj, itemKey) => {
      if (index < n) {
        index += 1;

        return {
          items: { ...obj.items, [itemKey]: instance[itemKey] },
          rest: obj.rest,
        };
      }

      return {
        items: obj.items,
        rest: { ...obj.rest, [itemKey]: instance[itemKey] },
      };
    },
    {
      items: {},
      rest: {},
    },
  );
};

export { splitObject as default };

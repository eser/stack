type SplitObjectResult<T> = {
  items: Record<string | number | symbol, T>;
  rest: Record<string | number | symbol, T>;
};

const splitObject = function splitObject<T>(
  instance: Record<string | number | symbol, T>,
  n: number,
): SplitObjectResult<T> {
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

export { splitObject, splitObject as default };

type PickFromObjectResult<T> = {
  items: Record<string | number | symbol, T>;
  rest: Record<string | number | symbol, T>;
};

const pickFromObject = <T>(
  instance: Record<string | number | symbol, T>,
  keys: readonly (string | number | symbol)[],
): PickFromObjectResult<T> => {
  return Object.keys(instance).reduce(
    (obj, itemKey) => {
      if (keys.indexOf(itemKey) !== -1) {
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

export { pickFromObject, pickFromObject as default };

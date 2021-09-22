type PickFromObjectResult<T> = {
  items: Record<string, T>;
  rest: Record<string, T>;
};

function pickFromObject<T>(
  instance: Record<string, T>,
  keys: Array<string>,
): PickFromObjectResult<T> {
  return Object.keys(instance).reduce(
    (obj: PickFromObjectResult<T>, itemKey: string) => {
      if (keys.indexOf(itemKey) !== -1) {
        return {
          items: Object.assign({}, obj.items, { [itemKey]: instance[itemKey] }),
          rest: obj.rest,
        };
      }

      return {
        items: obj.items,
        rest: Object.assign({}, obj.rest, { [itemKey]: instance[itemKey] }),
      };
    },
    {
      items: {},
      rest: {},
    },
  );
}

export { pickFromObject as default };

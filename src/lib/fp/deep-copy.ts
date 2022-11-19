// deno-lint-ignore no-explicit-any
function deepCopy<T extends Record<string | number | symbol, any>>(
  instance: T,
): T {
  if (!(instance instanceof Object)) {
    return instance;
  }

  const Type = instance.constructor as { new (): T };

  return Object.keys(instance).reduce(
    (obj, itemKey) => {
      const value = instance[itemKey];

      if (value instanceof Object && value.constructor !== Array) {
        return Object.assign(new Type(), obj, {
          [itemKey]: deepCopy(value),
        });
      }

      return Object.assign(new Type(), obj, {
        [itemKey]: value,
      });
    },
    new Type(),
  );
}

export { deepCopy, deepCopy as default };

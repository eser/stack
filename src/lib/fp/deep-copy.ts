// deno-lint-ignore no-explicit-any
const deepCopy = <T extends Record<string | number | symbol, any>>(
  instance: T,
): T => {
  if (!(instance instanceof Object)) {
    return instance;
  }

  const Type = instance.constructor as { new (): T };

  return Object.entries(instance).reduce(
    (obj, [itemKey, value]) => {
      if (value instanceof Object && value.constructor !== Array) {
        obj[itemKey] = deepCopy(value);

        return obj;
      }

      obj[itemKey] = value;

      return obj;
    },
    // deno-lint-ignore no-explicit-any
    new Type() as any,
  );
};

export { deepCopy, deepCopy as default };

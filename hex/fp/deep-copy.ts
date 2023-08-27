type Key = string | number | symbol;

// deno-lint-ignore no-explicit-any
export const deepCopy = <T extends Record<Key, any>>(
  instance: T,
): T => {
  if (typeof instance !== "object") { // PERF !(instance instanceof Object)
    return instance;
  }

  const Type = instance.constructor as { new (): T };
  const keys = Object.keys(instance); // PERF Object.entries(instance)
  // deno-lint-ignore no-explicit-any
  const instanceCopy: Record<Key, any> = new Type();

  for (const key of keys) {
    const value = instance[key];

    if (typeof value === "object") { // PERF value instanceof Object
      instanceCopy[key] = deepCopy(value);
    } else {
      instanceCopy[key] = value;
    }
  }

  return instanceCopy;
};

// deno-lint-ignore no-explicit-any
export const deepCopy2 = <T extends Record<string | number | symbol, any>>(
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

export { deepCopy as default };

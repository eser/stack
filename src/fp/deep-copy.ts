function deepCopy<T extends unknown>(instance: T): T {
  if (!(instance instanceof Object)) {
    return instance;
  }

  const Type = instance.constructor as { new (): T };

  return Object.keys(instance).reduce(
    (obj, itemKey) => {
      const value = (instance as Record<string | symbol, unknown>)[itemKey];
      if (value instanceof Object) {
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

// deno-lint-ignore no-explicit-any
type ObjectType = Record<string | number | symbol, any>;

function deepMerge<T extends ObjectType>(
  instance: T,
  other: ObjectType | undefined,
): ObjectType {
  if (!(instance instanceof Object)) {
    return instance;
  }

  const Type = instance.constructor as { new (): T };

  const firstMerge = Object.keys(instance).reduce(
    (acc, itemKey) => {
      const recordValue = instance[itemKey];
      const otherValue = other?.[itemKey];

      if (recordValue instanceof Object && recordValue.constructor !== Array) {
        return {
          merged: Object.assign(new Type(), acc.merged, {
            [itemKey]: deepMerge(recordValue, otherValue),
          }),
          otherKeys: acc.otherKeys.filter((x) => x !== itemKey),
        };
      }

      return {
        merged: Object.assign(new Type(), acc.merged, {
          [itemKey]: (otherValue !== undefined) ? otherValue : recordValue,
        }),
        otherKeys: acc.otherKeys.filter((x) => x !== itemKey),
      };
    },
    {
      merged: new Type(),
      otherKeys: (other !== undefined) ? Object.keys(other) : [],
    },
  );

  if (other === undefined) {
    return firstMerge.merged;
  }

  const finalMerge = firstMerge.otherKeys.reduce(
    (acc, itemKey) => {
      const otherValue = other[itemKey];

      if (otherValue === undefined) {
        return acc;
      }

      return Object.assign(acc, { [itemKey]: otherValue });
    },
    firstMerge.merged,
  );

  return finalMerge;
}

export { deepMerge, deepMerge as default };

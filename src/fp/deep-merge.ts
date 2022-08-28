// deno-lint-ignore no-explicit-any
type ObjectType = Record<string | number | symbol, any>;

function deepMerge<
  T1 extends ObjectType,
  T2 extends ObjectType,
  TR extends T1 & T2,
>(
  instance: T1,
  other: T2,
): TR {
  if (!(instance instanceof Object)) {
    return instance;
  }

  const Type = instance.constructor as { new (): TR };

  const firstMerge = Object.keys(instance).reduce(
    (acc, itemKey) => {
      const recordValue = instance[itemKey];
      const otherKeyExists = (other !== undefined) && (itemKey in other);
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
          [itemKey]: (otherKeyExists) ? otherValue : recordValue,
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

      // FIXME if key is defined in object, we need to merge it
      // if (otherValue === undefined) {
      //   return acc;
      // }

      return Object.assign(acc, { [itemKey]: otherValue });
    },
    firstMerge.merged,
  );

  return finalMerge;
}

export { deepMerge, deepMerge as default };

import deepCopy from "./deep-copy.ts";

// deno-lint-ignore ban-types
const deepCopyWith = function deepCopyWith<T extends object>(
  source: T,
  modificationFn: (value: T) => void,
): T {
  const instance = deepCopy(source);

  modificationFn(instance);

  return instance;
};

export { deepCopyWith, deepCopyWith as default };

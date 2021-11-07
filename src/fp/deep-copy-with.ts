import deepCopy from "./deep-copy.ts";

// deno-lint-ignore no-explicit-any
function deepCopyWith<T extends unknown>(
  source: T,
  modificationFn: (value: T) => any,
): T {
  const instance = deepCopy(source);

  modificationFn(instance);

  return instance;
}

export { deepCopyWith as default };

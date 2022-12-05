import { deepCopy } from "./deep-copy.ts";

// deno-lint-ignore ban-types
const mutate = <T extends object>(
  instance: T,
  mutator: (draft: T) => void,
): T => {
  const newInstance = deepCopy(instance);

  mutator(newInstance);

  // return deepCopy(newInstance);
  return newInstance;
};

export { mutate, mutate as default };

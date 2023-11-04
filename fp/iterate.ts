import { type Promisable } from "../standards/promises.ts";
export const iterate = async (
  // deno-lint-ignore no-explicit-any
  iterable: Promisable<Iterable<any>>,
  // deno-lint-ignore no-explicit-any
  func: (...args: readonly any[]) => Promisable<any>,
): Promise<void> => {
  for (const value of await iterable) {
    await func(value);
  }
};

export { iterate as default };

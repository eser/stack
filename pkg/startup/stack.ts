import * as assert from "../stdx/assert.ts";

export type Platform = unknown;

export interface Stack {
  platforms: Record<string | symbol, Platform>;
}

export const getPlatformFromStack = (
  stack: Stack,
  name: string,
): Platform => {
  assert.assert(
    name in stack.platforms, // name === undefined || name === null
    "platform name is required",
  );

  return stack.platforms[name];
};

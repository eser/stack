import * as asserts from "../../lib/stdx/testing/asserts.ts";

type Platform = unknown;

interface Stack {
  platforms: Record<string | symbol, Platform>;
}

const getPlatformFromStack = (
  stack: Stack,
  name: string,
): Platform => {
  asserts.assert(
    name in stack.platforms, // name === undefined || name === null
    "platform name is required",
  );

  return stack.platforms[name];
};

export { getPlatformFromStack, type Platform, type Stack };

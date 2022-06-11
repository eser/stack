import type PlatformContext from "./platform-context.ts";

function getVariable(
  context: PlatformContext,
  name: string,
): unknown | null | undefined {
  return context.getVariable(name);
}

export { getVariable as default };

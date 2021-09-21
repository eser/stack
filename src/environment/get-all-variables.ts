import type PlatformContext from "./platform-context.ts";

function getAllVariables(context: PlatformContext): Record<string, unknown | null> {
  return context.getAllVariables();
}

export { getAllVariables as default };

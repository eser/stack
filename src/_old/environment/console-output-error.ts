import type PlatformContext from "./platform-context.ts";

const consoleOutputError = function consoleOutputError(
  context: PlatformContext,
  error: Error,
): void {
};

export { consoleOutputError as default };

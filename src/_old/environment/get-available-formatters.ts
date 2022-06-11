import type Formatter from "../formatters/formatter.ts";
import type PlatformContext from "./platform-context.ts";

function getAvailableFormatters(context: PlatformContext): Formatter[] {
  return context.getAvailableFormatters();
}

export { getAvailableFormatters as default };

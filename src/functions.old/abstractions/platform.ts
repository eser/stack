import type { HexContext } from "./context.ts";
import type { HexFunctionInput } from "./functionInput.ts";

interface HexPlatform {
  // TODO available formatters
  // TODO syslog - debug function
  // TODO get environment variables

  getContext: () => HexContext;
  getDefaultInput: () => HexFunctionInput;
  commitResult: (result: Promise<string>) => Promise<void>;
}

export type { HexPlatform };

import type HexFunction from "./function.ts";
import type HexFunctionContext from "./function-context.ts";
import type HexFunctionInput from "./function-input.ts";

interface HexRuntime {
  context: HexFunctionContext;
  options: Record<string, unknown>;
  execute: (target: HexFunction, input?: HexFunctionInput) => Promise<void>;
}

export type { HexRuntime, HexRuntime as default };

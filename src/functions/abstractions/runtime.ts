import type { HexFunction } from "./function.ts";
import type { HexFunctionInput } from "./functionInput.ts";
import type { HexPlatform } from "./platform.ts";

interface HexRuntime {
  platform: HexPlatform;
  options?: Record<string, unknown>;
  execute: (target: HexFunction, input?: HexFunctionInput) => Promise<void>;
}

export type { HexRuntime };

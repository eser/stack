import { HexFunction } from "./function.ts";
import { HexFunctionInput } from "./functionInput.ts";
import { HexPlatform } from "./platform.ts";

interface HexRuntime {
  platform: HexPlatform;
  options?: Record<string, unknown>;
  execute: (target: HexFunction, input?: HexFunctionInput) => Promise<void>;
}

export type {
  HexRuntime,
};

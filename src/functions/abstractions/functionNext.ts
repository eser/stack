import type { HexContext } from "./context.ts";
import type { HexFunctionResult } from "./functionResult.ts";

type HexFunctionNext = (newContext?: HexContext) => HexFunctionResult;

export type { HexFunctionNext };

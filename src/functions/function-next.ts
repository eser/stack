import type HexFunctionContext from "./function-context.ts";
import type HexFunctionResult from "./function-result.ts";

type HexFunctionNext = (newContext?: HexFunctionContext) => HexFunctionResult;

export type { HexFunctionNext, HexFunctionNext as default };

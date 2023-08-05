import { type HexFunctionContext } from "./function-context.ts";
import { type HexFunctionResult } from "./function-result.ts";

export type HexFunctionNext = (
  newContext?: HexFunctionContext,
) => HexFunctionResult;

export { type HexFunctionNext as default };

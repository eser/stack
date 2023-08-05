import { type HexFunctionContext } from "./function-context.ts";
import { type HexFunctionInput } from "./function-input.ts";
import { type HexFunctionNext } from "./function-next.ts";
import { type HexFunctionResult } from "./function-result.ts";

// deno-lint-ignore no-explicit-any
export type HexFunction<T = Record<string | number | symbol, any>> = (
  input: HexFunctionInput<T>,
  ctx: HexFunctionContext,
  next?: HexFunctionNext,
) => HexFunctionResult;

export { type HexFunction as default };

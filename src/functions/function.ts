import type HexFunctionContext from "./function-context.ts";
import type HexFunctionInput from "./function-input.ts";
import type HexFunctionNext from "./function-next.ts";
import type HexFunctionResult from "./function-result.ts";

type HexFunction = (
	input: HexFunctionInput,
	context: HexFunctionContext,
	next?: HexFunctionNext,
) => HexFunctionResult;

export type { HexFunction, HexFunction as default };

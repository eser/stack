import type { HexContext } from "./context.ts";
import type { HexFunctionInput } from "./functionInput.ts";
import type { HexFunctionNext } from "./functionNext.ts";
import type { HexFunctionResult } from "./functionResult.ts";

type HexFunction = (
	input: HexFunctionInput,
	context: HexContext,
	next?: HexFunctionNext,
) => HexFunctionResult;

export type { HexFunction };

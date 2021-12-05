import type { HexContext } from "./abstractions/context.ts";
import type { HexFunction } from "./abstractions/function.ts";
import type { HexFunctionInput } from "./abstractions/functionInput.ts";
import type { HexFunctionNext } from "./abstractions/functionNext.ts";
import type { HexFunctionResult } from "./abstractions/functionResult.ts";

function router(...routes: Array<HexFunction>): HexFunction {
	// TODO collect each route definition by executing them

	// TODO return an HexFunction that decides which route definition
	//      should be executed according to input parameters
	return function (
		input: HexFunctionInput,
		context: HexContext,
		next?: HexFunctionNext,
	): HexFunctionResult {
		throw new Error("not implemented yet.");
	};
}

export { router };

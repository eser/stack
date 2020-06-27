import HexFunction from "./types/function.ts";
import HexFunctionInput from "./types/functionInput.ts";
import HexFunctionContext from "./types/functionContext.ts";
import HexFunctionNext from "./types/functionNext.ts";
import HexFunctionResult from "./types/functionResult.ts";

function router(...routes: Array<HexFunction>): HexFunction {
  // TODO collect each route definition by executing them

  // TODO return an HexFunction that decides which route definition
  //      should be executed according to input parameters
  return function (
    input: HexFunctionInput,
    context: HexFunctionContext,
    next: HexFunctionNext,
  ): HexFunctionResult {
    throw new Error("not implemented yet.");
  };
}

export {
  router,
};

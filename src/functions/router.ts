import { type HexFunction } from "./function.ts";
import { type HexFunctionContext } from "./function-context.ts";
import { type HexFunctionInput } from "./function-input.ts";
import { type HexFunctionNext } from "./function-next.ts";
import { type HexFunctionResult } from "./function-result.ts";

const router = function router(
  ..._routes: readonly HexFunction[]
): HexFunction {
  // TODO(@eserozvataf) collect each route definition by executing them

  // TODO(@eserozvataf) return an HexFunction that decides which route
  //      definition should be executed according to input parameters
  return function (
    _input: HexFunctionInput,
    _context: HexFunctionContext,
    _next?: HexFunctionNext,
  ): HexFunctionResult {
    throw new Error("not implemented yet.");
  };
};

export { router, router as default };

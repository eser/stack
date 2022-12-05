import { type HexFunction } from "./function.ts";
import { type HexFunctionContext } from "./function-context.ts";
import { type HexFunctionInput } from "./function-input.ts";
import { type HexFunctionNext } from "./function-next.ts";
import { type HexFunctionResult } from "./function-result.ts";

const router = <T>(
  ..._routes: readonly HexFunction<T>[]
): HexFunction<T> => {
  // TODO(@eserozvataf) collect each route definition by executing them

  // TODO(@eserozvataf) return an HexFunction that decides which route
  //      definition should be executed according to input parameters
  return (
    _input: HexFunctionInput<T>,
    _ctx: HexFunctionContext,
    _next?: HexFunctionNext,
  ): HexFunctionResult => {
    throw new Error("not implemented yet.");
  };
};

export { router, router as default };

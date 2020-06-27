import HexFunctionInput from "./functionInput.ts";
import HexFunctionContext from "./functionContext.ts";
import HexFunctionNext from "./functionNext.ts";
import HexFunctionResult from "./functionResult.ts";

type HexFunction = (
  input: HexFunctionInput,
  context: HexFunctionContext,
  next?: HexFunctionNext,
) => HexFunctionResult;

export {
  HexFunction as default,
};

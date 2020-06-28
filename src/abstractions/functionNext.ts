import HexFunctionContext from "./functionContext.ts";
import HexFunctionResult from "./functionResult.ts";

type HexFunctionNext = (newContext?: HexFunctionContext) => HexFunctionResult;

export {
  HexFunctionNext as default,
};

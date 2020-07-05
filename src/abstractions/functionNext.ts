import HexContext from "./context.ts";
import HexFunctionResult from "./functionResult.ts";

type HexFunctionNext = (newContext?: HexContext) => HexFunctionResult;

export {
  HexFunctionNext as default,
};

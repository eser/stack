import { HexContext } from "./context.ts";
import { HexFunctionInput } from "./functionInput.ts";
import { HexFunctionNext } from "./functionNext.ts";
import { HexFunctionResult } from "./functionResult.ts";

type HexFunction = (
  input: HexFunctionInput,
  context: HexContext,
  next?: HexFunctionNext,
) => HexFunctionResult;

export type {
  HexFunction,
};

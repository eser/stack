import HexFunctionResult from "./functionResult.ts";

type HexFormatter = (result: HexFunctionResult) => Promise<string>;

export {
  HexFormatter as default,
};

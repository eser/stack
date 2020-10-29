import { HexFunctionResult } from "./functionResult.ts";

type HexFormatter = (result: HexFunctionResult) => Promise<string>;

export type { HexFormatter };

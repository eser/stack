interface HexFunctionResultBody {
  error?: Error;
  payload?: unknown;
}

type HexFunctionResult =
  | Generator<HexFunctionResultBody | void>
  | HexFunctionResultBody
  | void;

export type { HexFunctionResult, HexFunctionResult as default };

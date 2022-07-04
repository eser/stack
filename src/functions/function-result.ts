interface HexFunctionResultBody {
  error?: Error;
  payload?: unknown;
}

type HexFunctionResult =
  | AsyncGenerator<HexFunctionResultBody | void>
  | Generator<HexFunctionResultBody | void>
  | Promise<HexFunctionResultBody | void>
  | HexFunctionResultBody
  | void;

export type { HexFunctionResult, HexFunctionResult as default };

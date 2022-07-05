interface HexFunctionResultBody {
  error?: Error;
  payload?: unknown;
}

type HexFunctionResultAsyncGen = AsyncGenerator<HexFunctionResultBody | void>;

type HexFunctionResultGen = Generator<HexFunctionResultBody | void>;

type HexFunctionResult =
  | HexFunctionResultAsyncGen
  | HexFunctionResultGen
  | Promise<HexFunctionResultBody | void>
  | HexFunctionResultBody
  | void;

export type {
  HexFunctionResult,
  HexFunctionResult as default,
  HexFunctionResultAsyncGen,
  HexFunctionResultBody,
  HexFunctionResultGen,
};

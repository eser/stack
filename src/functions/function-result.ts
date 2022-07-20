interface HexFunctionResultBody {
  error?: Error;
  payload?: unknown;
}

type HexFunctionResultAsyncGen = AsyncGenerator<HexFunctionResultBody | void>;

type HexFunctionResultGen = Generator<HexFunctionResultBody | void>;

type HexFunctionResultIterable =
  | HexFunctionResultAsyncGen
  | HexFunctionResultGen;

type HexFunctionResultNonIterable =
  | Promise<HexFunctionResultBody | void>
  | HexFunctionResultBody
  | void;

type HexFunctionResult =
  | HexFunctionResultIterable
  | HexFunctionResultNonIterable;

export type {
  HexFunctionResult,
  HexFunctionResult as default,
  HexFunctionResultAsyncGen,
  HexFunctionResultBody,
  HexFunctionResultGen,
  HexFunctionResultIterable,
  HexFunctionResultNonIterable,
};

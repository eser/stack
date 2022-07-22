// deno-lint-ignore no-explicit-any
type HexFunctionPayloadTypes = any;

interface HexFunctionResultBody<T = HexFunctionPayloadTypes> {
  error?: Error;
  payload?: T;
}

type HexFunctionResultAsyncGen<T = HexFunctionPayloadTypes> = AsyncGenerator<
  HexFunctionResultBody<T>
>;

type HexFunctionResultGen<T = HexFunctionPayloadTypes> = Generator<
  HexFunctionResultBody<T>
>;

type HexFunctionResultIterable<T = HexFunctionPayloadTypes> =
  | HexFunctionResultAsyncGen<T>
  | HexFunctionResultGen<T>;

type HexFunctionResultNonIterable<T = HexFunctionPayloadTypes> =
  | Promise<HexFunctionResultBody<T>>
  | HexFunctionResultBody<T>;

type HexFunctionResult<T = HexFunctionPayloadTypes> =
  | HexFunctionResultIterable<T>
  | HexFunctionResultNonIterable<T>
  | Promise<void>
  | void;

export type {
  HexFunctionResult,
  HexFunctionResult as default,
  HexFunctionResultAsyncGen,
  HexFunctionResultBody,
  HexFunctionResultGen,
  HexFunctionResultIterable,
  HexFunctionResultNonIterable,
};

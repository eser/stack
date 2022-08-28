// deno-lint-ignore no-explicit-any
type HexFunctionPayloadTypes = any;
// deno-lint-ignore no-explicit-any
type HexFunctionExtraData = Record<string | number | symbol, any>;

interface HexFunctionResultBody<T = HexFunctionPayloadTypes> {
  error?: Error;
  payload?: T;
  extraData?: HexFunctionExtraData;

  // with: (
  //   extraData: HexFunctionExtraData,
  // ) => HexFunctionResultBody<T>;
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

export {
  type HexFunctionExtraData,
  type HexFunctionResult,
  type HexFunctionResult as default,
  type HexFunctionResultAsyncGen,
  type HexFunctionResultBody,
  type HexFunctionResultGen,
  type HexFunctionResultIterable,
  type HexFunctionResultNonIterable,
};

// deno-lint-ignore no-explicit-any
type HexFunctionPayloadTypes = any;
// deno-lint-ignore no-explicit-any
export type HexFunctionExtraData = Record<string | number | symbol, any>;

export interface HexFunctionResultBody<T = HexFunctionPayloadTypes> {
  error?: Error;
  payload?: T;
  extraData?: HexFunctionExtraData;

  // with: (
  //   extraData: HexFunctionExtraData,
  // ) => HexFunctionResultBody<T>;
}

export type HexFunctionResultAsyncGen<T = HexFunctionPayloadTypes> =
  AsyncGenerator<
    HexFunctionResultBody<T>
  >;

export type HexFunctionResultGen<T = HexFunctionPayloadTypes> = Generator<
  HexFunctionResultBody<T>
>;

export type HexFunctionResultIterable<T = HexFunctionPayloadTypes> =
  | HexFunctionResultAsyncGen<T>
  | HexFunctionResultGen<T>;

export type HexFunctionResultNonIterable<T = HexFunctionPayloadTypes> =
  | Promise<HexFunctionResultBody<T>>
  | HexFunctionResultBody<T>;

export type HexFunctionResult<T = HexFunctionPayloadTypes> =
  | HexFunctionResultIterable<T>
  | HexFunctionResultNonIterable<T>
  | Promise<void>
  | void;

export { type HexFunctionResult as default };

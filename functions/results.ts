// deno-lint-ignore no-explicit-any
export type ExtraData = Record<string | number | symbol, any>;

export interface ResultBody<T> {
  error?: Error;
  payload?: T;
  extraData?: ExtraData;

  // with: (
  //   extraData: ExtraData,
  // ) => ResultBody<T>;
}

export type ResultAsyncGen<T> = AsyncGenerator<
  ResultBody<T>
>;

export type ResultGen<T> = Generator<
  ResultBody<T>
>;

export type ResultIterable<T> =
  | ResultAsyncGen<T>
  | ResultGen<T>;

export type ResultNonIterable<T> =
  | Promise<ResultBody<T>>
  | ResultBody<T>;

export type Result<T> =
  | ResultIterable<T>
  | ResultNonIterable<T>
  | Promise<void>
  | void;

export const Ok = <T>(result?: T): ResultBody<T> => {
  return {
    payload: result,
  };
};

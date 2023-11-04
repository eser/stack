import { type Promisable } from "../standards/promises.ts";

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

export type ResultIterable<T> = AsyncIterable<ResultBody<T>>;
export type ResultNonIterable<T> = Promisable<ResultBody<T>>;
export type ResultNone = Promisable<void>;
export type Result<T> =
  | ResultIterable<T>
  | ResultNonIterable<T>
  | ResultNone;

export const Ok = <T>(result?: T): ResultBody<T> => {
  return {
    payload: result,
  };
};

export const Fail = <T>(error: Error, result?: T): ResultBody<T> => {
  return {
    error: error,
    payload: result,
  };
};

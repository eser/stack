// deno-lint-ignore no-explicit-any
export type ExtraData = Record<string | number | symbol, any>;

export interface Result<T> {
  error?: Error;
  payload?: T;
  extraData?: ExtraData;

  // with: (
  //   extraData: ExtraData,
  // ) => Result<T>;
}

export const Ok = <T>(result?: T): Result<T> => {
  return {
    payload: result,
  };
};

export const Fail = <T>(error: Error, result?: T): Result<T> => {
  return {
    error: error,
    payload: result,
  };
};

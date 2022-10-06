import {
  type HexFunctionExtraData,
  type HexFunctionResultBody,
} from "./function-result.ts";

const result = <T>(
  body: HexFunctionResultBody<T>, // Omit<HexFunctionResultBody<T>, "with" | "extraData">,
  extraData?: HexFunctionExtraData,
) => {
  const newBody: HexFunctionResultBody<T> = {
    ...body,
    // with: (extraData: HexFunctionExtraData) => {
    //   Object.assign(newBody.extra, extra);
    //   return newBody;
    // },
  };

  if (extraData !== undefined) {
    newBody.extraData = extraData;
  }

  return newBody;
};

const ok = (
  extraData?: HexFunctionExtraData,
): HexFunctionResultBody<never> => {
  return result<never>({
    payload: undefined,
  }, extraData);
};

const text = (
  message: string,
  extraData?: HexFunctionExtraData,
): HexFunctionResultBody<string> => {
  return result<string>({
    payload: message,
  }, extraData);
};

const reactView = (
  // deno-lint-ignore no-explicit-any
  view: any,
  extraData?: HexFunctionExtraData,
  // deno-lint-ignore no-explicit-any
): HexFunctionResultBody<any> => {
  // deno-lint-ignore no-explicit-any
  return result<any>({
    payload: view,
  }, extraData);
};

const error = (
  message: string,
  error: Error,
  extraData?: HexFunctionExtraData,
): HexFunctionResultBody<string> => {
  return result<string>({
    payload: message,
    error: error,
  }, extraData);
};

const results = {
  ok,
  text, // text/plain
  // object(), // application/json, application/xml depending on request headers
  // file(),   // application/octet-stream
  // sound(),  // sends a sound file, dependending on platform
  // media(),  // ?

  reactView,

  // preconditionFailed(),
  // unauthorized(),
  // unsupported(), // unprocessable() // notAllowed()
  // unavailable(),
  // timedout(),
  error, // error(),
  // notFound(),
  // notImplemented(),
};

export { results, results as default };

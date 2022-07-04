import type HexFunctionResult from "./function-result.ts";

const ok = function ok(): HexFunctionResult {
  return {
    payload: undefined,
  };
};

const text = function text(message: string): HexFunctionResult {
  return {
    payload: message,
  };
};

const error = function error(message: string, error: Error): HexFunctionResult {
  return {
    payload: message,
    error: error,
  };
};

const results = {
  ok,
  text, // text/plain
  // object(), // application/json, application/xml depending on request headers
  // file(),   // application/octet-stream
  // sound(),  // sends a sound file, dependending on platform
  // media(),  // ?

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

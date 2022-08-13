import { type HexFunctionResultBody } from "./function-result.ts";

const ok = function ok(): HexFunctionResultBody<never> {
  return {
    payload: undefined,
  };
};

const text = function text(message: string): HexFunctionResultBody<string> {
  return {
    payload: message,
  };
};

// deno-lint-ignore no-explicit-any
const reactView = function reactView(view: any): HexFunctionResultBody<any> {
  return {
    payload: view,
  };
};

const error = function error(
  message: string,
  error: Error,
): HexFunctionResultBody<string> {
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

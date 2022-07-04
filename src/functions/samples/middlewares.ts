import type {
  HexFunctionContext,
  HexFunctionInput,
  HexFunctionNext,
  HexFunctionResult,
} from "../mod.ts";
import * as hex from "../../mod.ts";

const initMiddleware = function initMiddleware(
  input: HexFunctionInput,
  context: HexFunctionContext,
  next?: HexFunctionNext,
): HexFunctionResult {
  context.vars.number = 1;

  if (next !== undefined) {
    return next();
  }
};

const validationMiddleware = function validationMiddleware(
  input: HexFunctionInput,
  context: HexFunctionContext,
  next?: HexFunctionNext,
): HexFunctionResult {
  if (input.parameters[0] === undefined) {
    return hex.functions.results.error(
      "parameter is not specified",
      new Error("parameter is not specified"),
    );
  }

  if (next !== undefined) {
    return next();
  }
};

const main = function main(
  input: HexFunctionInput,
  context: HexFunctionContext,
): HexFunctionResult {
  const message = `hello ${context.vars.number} ${input.parameters[0]}`;

  return hex.functions.results.text(message);
};

const composed = hex.functions.composer(
  initMiddleware,
  validationMiddleware,
  main,
);

hex.functions.execute(composed);

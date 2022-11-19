import {
  type HexFunctionContext,
  type HexFunctionInput,
  type HexFunctionNext,
  type HexFunctionResult,
} from "../mod.ts";
import * as hex from "../../mod.ts";

const initMiddleware = (
  _input: HexFunctionInput,
  ctx: HexFunctionContext,
  next?: HexFunctionNext,
): HexFunctionResult => {
  ctx.vars = { ...(ctx.vars ?? {}), number: 1 };

  return next?.();
};

const validationMiddleware = (
  input: HexFunctionInput,
  _ctx: HexFunctionContext,
  next?: HexFunctionNext,
): HexFunctionResult => {
  if (input.params[0] === undefined) {
    return hex.functions.results.error(
      "parameter is not specified",
      new Error("parameter is not specified"),
    );
  }

  return next?.();
};

const main = (
  input: HexFunctionInput,
  ctx: HexFunctionContext,
): HexFunctionResult => {
  const message = `hello ${ctx.vars?.number} ${input.params[0]}`;

  return hex.functions.results.text(message);
};

const composed = hex.functions.composer(
  initMiddleware,
  validationMiddleware,
  main,
);

hex.functions.dumper(
  hex.functions.executeFromCli(composed),
);

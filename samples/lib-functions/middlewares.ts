import * as functions from "@hexfunctions/mod.ts";

const initMiddleware = (
  _input: functions.HexFunctionInput,
  ctx: functions.HexFunctionContext,
  next?: functions.HexFunctionNext,
): functions.HexFunctionResult => {
  ctx.vars = { ...(ctx.vars ?? {}), number: 1 };

  return next?.();
};

const validationMiddleware = (
  input: functions.HexFunctionInput,
  _ctx: functions.HexFunctionContext,
  next?: functions.HexFunctionNext,
): functions.HexFunctionResult => {
  if (input.params[0] === undefined) {
    return functions.results.error(
      "parameter is not specified",
      new Error("parameter is not specified"),
    );
  }

  return next?.();
};

const main = (
  input: functions.HexFunctionInput,
  ctx: functions.HexFunctionContext,
): functions.HexFunctionResult => {
  const message = `hello ${ctx.vars?.number} ${input.params[0]}`;

  return functions.results.text(message);
};

const composed = functions.composer(
  initMiddleware,
  validationMiddleware,
  main,
);

functions.dumper(
  functions.executeFromCli(composed),
);

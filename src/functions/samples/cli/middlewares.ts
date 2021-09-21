import hex from "../../../mod.ts";

function initMiddleware(
  input: HexFunctionInput,
  context: HexFunctionContext,
  next?: HexFunctionNext,
): HexFunctionResult {
  context.vars.number = 1;

  if (next !== undefined) {
    return next();
  }
}

function validationMiddleware(
  input: HexFunctionInput,
  context: HexFunctionContext,
  next?: HexFunctionNext,
): HexFunctionResult {
  if (input.parameters[0] === undefined) {
    return results.error(
      "parameter is not specified",
      new Error("parameter is not specified"),
    );
  }

  if (next !== undefined) {
    return next();
  }
}

function main(
  input: HexFunctionInput,
  context: HexFunctionContext,
): HexFunctionResult {
  const message = `hello ${context.vars.number} ${input.parameters[0]}`;

  return results.text(message);
}

const composed = composer(initMiddleware, validationMiddleware, main);

const runtime = createRuntime(platforms.cli);
runtime.execute(composed);

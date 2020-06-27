import cli from "../../src/platforms/cli.ts";
import {
  composer,
  results,
  HexFunctionInput,
  HexFunctionContext,
  HexFunctionResult,
  HexFunctionNext,
} from "../../src/mod.ts";

async function firstMiddleware(
  input: HexFunctionInput,
  context: HexFunctionContext,
  next?: HexFunctionNext,
): HexFunctionResult {
  context.vars.number = 1;

  if (next !== undefined) {
    return next();
  }
}

async function secondMiddleware(
  input: HexFunctionInput,
  context: HexFunctionContext,
  next?: HexFunctionNext,
): HexFunctionResult {
  (context.vars.number as number) += 1;

  if (next !== undefined) {
    return next();
  }
}

function main(
  input: HexFunctionInput,
  context: HexFunctionContext,
): HexFunctionResult {
  const message = `hello ${context.vars.number} ${input.parameters[0]}`;

  return Promise.resolve(results.text(message));
}

const composed = composer(firstMiddleware, secondMiddleware, main);

cli(composed);

import cli from "../../src/platforms/cli.ts";
import {
  results,
  HexFunctionInput,
  HexFunctionContext,
  HexFunctionResult,
} from "../../src/mod.ts";

function main(
  input: HexFunctionInput,
  context: HexFunctionContext,
): HexFunctionResult {
  const message = `hello ${input.parameters[0]}`;

  return Promise.resolve(results.text(message));
}

cli(main);

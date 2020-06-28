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
  const to = input.parameters[0] ?? "world";
  const message = `hello ${to}`;

  return results.text(message);
}

cli(main);

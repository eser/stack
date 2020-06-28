import {
  HexFunctionInput,
  HexFunctionContext,
  HexFunctionResult,
  results,
  cli,
} from "../../mod.ts";

function main(
  input: HexFunctionInput,
  context: HexFunctionContext,
): HexFunctionResult {
  const to = input.parameters[0] ?? "world";
  const message = `hello ${to}`;

  return results.text(message);
}

cli(main);

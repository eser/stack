import {
  createRuntime,
  HexContext,
  HexFunctionInput,
  HexFunctionResult,
  platforms,
  results,
} from "../../../src/functions/mod.ts";

function main(
  input: HexFunctionInput,
  context: HexContext,
): HexFunctionResult {
  const to = input.parameters[0] ?? "world";
  const message = `hello ${to}`;

  return results.text(message);
}

const runtime = createRuntime(platforms.cli);
runtime.execute(main);

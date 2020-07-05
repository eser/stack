import {
  HexFunctionInput,
  HexContext,
  HexFunctionResult,
  results,
  createRuntime,
  cli,
} from "../../mod.ts";

function main(
  input: HexFunctionInput,
  context: HexContext,
): HexFunctionResult {
  const to = input.parameters[0] ?? "world";
  const message = `hello ${to}`;

  return results.text(message);
}

const runtime = createRuntime(cli);
runtime.execute(main);

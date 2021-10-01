import type {
  HexFunctionContext,
  HexFunctionInput,
  HexFunctionResult,
} from "../../../src/functions/mod.ts";
import hex from "../../../mod.ts";

function main(
  input: HexFunctionInput,
  context: HexFunctionContext,
): HexFunctionResult {
  const to = input.parameters[0] ?? "world";
  const message = `hello ${to}`;

  return hex.functions.results.text(message);
}

const runtime = hex.functions.createRuntime(hex.environment.platforms.cli);
runtime.execute(main);

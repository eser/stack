import type {
  HexFunctionContext,
  HexFunctionInput,
  HexFunctionResult,
} from "../mod.ts";
import * as hex from "../../mod.ts";

const main = function main(
  input: HexFunctionInput,
  context: HexFunctionContext,
): HexFunctionResult {
  const to = input.parameters[0] ?? "world";
  const message = `hello ${to}`;

  return hex.functions.results.text(message);
};

hex.functions.execute(main);

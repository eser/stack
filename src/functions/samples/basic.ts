import {
  type HexFunctionContext,
  type HexFunctionInput,
  type HexFunctionResult,
} from "../mod.ts";
import * as hex from "../../mod.ts";

const main = function main(
  input: HexFunctionInput,
  _context: HexFunctionContext,
): HexFunctionResult {
  const to = input.parameters[0] ?? "world";
  const message = `hello ${to}`;

  return hex.functions.results.text(message);
};

hex.functions.dumper(
  hex.functions.executeFromCli(main),
);

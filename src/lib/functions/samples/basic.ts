import {
  type HexFunctionContext,
  type HexFunctionInput,
  type HexFunctionResult,
} from "../mod.ts";
import * as hex from "../../mod.ts";

const main = (
  input: HexFunctionInput,
  _ctx: HexFunctionContext,
): HexFunctionResult => {
  const to = input.params[0] ?? "world";
  const message = `hello ${to}`;

  return hex.functions.results.text(message);
};

hex.functions.dumper(
  hex.functions.executeFromCli(main),
);

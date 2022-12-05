import {
  type HexFunctionContext,
  type HexFunctionInput,
  type HexFunctionResult,
} from "../mod.ts";
import * as hex from "../../mod.ts";

const sleep = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const main = async function* (
  input: HexFunctionInput,
  _ctx: HexFunctionContext,
): HexFunctionResult {
  const to = input.params[0] ?? "world";

  yield hex.functions.results.text(`hello ${to} #1`);
  await sleep(1000);
  yield hex.functions.results.text(`hello ${to} #2`);
};

hex.functions.dumper(
  hex.functions.executeFromCli(main),
);

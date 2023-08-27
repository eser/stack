import * as functions from "../mod.ts";

const sleep = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const main = async function* (
  input: functions.HexFunctionInput,
  _ctx: functions.HexFunctionContext,
): functions.HexFunctionResult {
  const to = input.params[0] ?? "world";

  yield functions.results.text(`hello ${to} #1`);
  await sleep(1000);
  yield functions.results.text(`hello ${to} #2`);
};

functions.dumper(
  functions.executeFromCli(main),
);

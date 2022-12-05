import * as hex from "../../mod.ts";

const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const main = async function* (input) {
  const to = input.params[0] ?? "world";

  yield hex.functions.results.text(`hello ${to} #1`);
  await sleep(1000);
  yield hex.functions.results.text(`hello ${to} #2`);
};

hex.functions.dumper(
  hex.functions.executeFromCli(main),
);

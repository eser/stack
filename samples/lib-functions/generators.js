import * as functions from "@hexfunctions/mod.ts";

const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const main = async function* (input) {
  const to = input.params[0] ?? "world";

  yield functions.results.text(`hello ${to} #1`);
  await sleep(1000);
  yield functions.results.text(`hello ${to} #2`);
};

functions.dumper(
  functions.executeFromCli(main),
);

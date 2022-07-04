import * as hex from "../../mod.ts";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const main = async function* main(input) {
  const to = input.parameters[0] ?? "world";

  yield hex.functions.results.text(`hello ${to} #1`);
  await sleep(1000);
  yield hex.functions.results.text(`hello ${to} #2`);
};

hex.functions.execute(main);

import * as hex from "../../mod.ts";

const main = function* main(input) {
  const to = input.parameters[0] ?? "world";

  yield hex.functions.results.text(`hello ${to} #1`);
  yield hex.functions.results.text(`hello ${to} #2`);
};

hex.functions.execute(main);

import * as hex from "../../mod.ts";

const main = function main(input) {
  const to = input.parameters[0] ?? "world";
  const message = `hello ${to}`;

  return hex.functions.results.text(message);
};

hex.functions.execute(main);

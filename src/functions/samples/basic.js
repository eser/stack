import * as hex from "../../mod.ts";

const main = (input) => {
  const to = input.params[0] ?? "world";
  const message = `hello ${to}`;

  return hex.functions.results.text(message);
};

hex.functions.dumper(
  hex.functions.executeFromCli(main),
);

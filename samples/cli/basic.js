import { results, cli } from "../../mod.ts";

function main(input) {
  const to = input.parameters[0] ?? "world";
  const message = `hello ${to}`;

  return results.text(message);
}

cli(main);

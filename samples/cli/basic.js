import cli from "../../src/platforms/cli.ts";
import { results } from "../../mod.ts";

function main(input) {
  const to = input.parameters[0] ?? "world";
  const message = `hello ${to}`;

  return results.text(message);
}

cli(main);

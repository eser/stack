import { results, webapi } from "../../mod.ts";

function main(input) {
  const to = input.parameters.name ?? "world";
  const message = `hello ${to}`;

  return results.text(message);
}

webapi(main, 3000);

import hex from "../../../mod.ts";

function main(input) {
  const to = input.parameters[0] ?? "world";
  const message = `hello ${to}`;

  return hex.functions.results.text(message);
}

const runtime = hex.functions.createRuntime(hex.environment.platforms.cli);
runtime.execute(main);

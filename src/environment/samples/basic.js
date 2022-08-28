import * as hex from "../../mod.ts";

const _fnc = function fnc(input) {
  const to = input.parameters[0] ?? "world";
  const message = `hello ${to}`;

  return hex.functions.results.text(message);
};

// hex.functions.dumper(
//   hex.functions.executeFromCli(fnc),
// );

async function main() {
  const env = hex.environment.environment(
    hex.environment.cli(),
  );

  await env.dispatch("write", "Hello, world!");
}

main();

import * as hex from "../../mod.ts";

const _fnc = (input) => {
  const to = input.params[0] ?? "world";
  const message = `hello ${to}`;

  return hex.functions.results.text(message);
};

// hex.functions.dumper(
//   hex.functions.executeFromCli(fnc),
// );

const main = async () => {
  const env = hex.environment.environment(
    hex.environment.cli(),
  );

  await env.dispatch("write", "Hello, world!");
};

main();

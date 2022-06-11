import { environment } from "./environment/mod.ts";
import { cli } from "./environment/cli/mod.ts";
import { webapi } from "./environment/webapi/mod.ts";

async function main() {
  const env = environment(cli(), webapi());

  console.log(await env.read());
  console.log("...");

  env.write("Hello, world!");
}

main();

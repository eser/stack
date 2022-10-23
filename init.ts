import { init } from "./src/generator/init.ts";

if (import.meta.main) {
  init(Deno.args, { module: import.meta.url });
}

export { init, init as default };

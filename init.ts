import { init } from "./src/generator/init.ts";

if (import.meta.main) {
  init(Deno.args);
}

export { init, init as default };

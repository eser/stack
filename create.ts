import { create } from "./src/generator/create.ts";

if (import.meta.main) {
  create(Deno.args, { module: import.meta.url });
}

export { create, create as default };

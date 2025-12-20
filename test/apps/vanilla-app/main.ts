import * as runtime from "@eser/standards/runtime";

export function main() {
  console.log(runtime.runtime.name);
}

// Learn more at https://docs.deno.com/runtime/manual/examples/module_metadata#concepts
if (import.meta.main) {
  main();
}

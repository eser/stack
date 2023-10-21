import { defineConfig } from "../../server.ts";
import * as path from "https://deno.land/std@0.204.0/path/mod.ts";

export default defineConfig({
  plugins: [
    {
      name: "a",
      buildEnd() {
        console.log("Plugin a: buildEnd");
      },
      buildStart() {
        console.log("Plugin a: buildStart");
      },
    },
    {
      name: "b",
      buildEnd() {
        console.log("Plugin b: buildEnd");
      },
      buildStart() {
        console.log("Plugin b: buildStart");
      },
    },
    {
      name: "c",
      buildStart(config) {
        const outDir = path.relative(Deno.cwd(), config.build.outDir);
        console.log(`Plugin c: ${outDir}`);
      },
    },
  ],
});

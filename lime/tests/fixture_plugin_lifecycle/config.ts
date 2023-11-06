// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { defineConfig, type LimeConfig } from "../../server.ts";
import * as path from "$std/path/mod.ts";

export const config = defineConfig({
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
}) as LimeConfig;

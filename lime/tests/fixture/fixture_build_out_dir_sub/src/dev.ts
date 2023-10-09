#!/usr/bin/env -S deno run -A --watch=static/,routes/

import dev from "$cool/lime/dev.ts";

await dev(import.meta.url, "./main.ts", {
  build: {
    outDir: Deno.env.get("LIME_TEST_OUTDIR") ?? undefined,
  },
});

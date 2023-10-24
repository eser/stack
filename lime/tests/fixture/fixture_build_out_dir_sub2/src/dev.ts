#!/usr/bin/env -S deno run -A --watch=static/,routes/

import { dev } from "../../../../dev.ts";

await dev(import.meta.url, {
  build: {
    outDir: Deno.env.get("LIME_TEST_OUTDIR") ?? undefined,
  },
});

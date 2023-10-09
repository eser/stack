#!/usr/bin/env -S deno run -A --watch=static/,routes/

import dev from "$cool/lime/dev.ts";
import options from "./options.ts";

await dev(import.meta.url, "./main.ts", options);

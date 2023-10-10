#!/usr/bin/env -S deno run -A --watch=static/,routes/

import dev from "../../dev.ts";
import config from "./config.ts";

await dev(import.meta.url, config);

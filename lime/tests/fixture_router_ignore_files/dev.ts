#!/usr/bin/env -S deno run -A --watch=static/,routes/

import { dev } from "../../dev.ts";
import { options } from "./options.ts";

await dev(import.meta.url, options);

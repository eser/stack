/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />

import { start } from "$cool/lime/server.ts";
import routes from "./manifest.gen.ts";
import options from "./options.ts";

await start(routes, options);

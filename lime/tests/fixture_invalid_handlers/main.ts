/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />

import { start } from "../../server.ts";
import manifest from "./manifest.gen.ts";

// @ts-expect-error: the index.tsx file declares a "handlers" but no "handler", to simulate a typo or confusion on the user's part
await start(manifest);

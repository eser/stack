// Copyright 2023 the cool authors. All rights reserved. MIT license.

/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />

import { start } from "../../server.ts";
import { manifest } from "./manifest.gen.ts";
import { config } from "./config.ts";

// this just exists to function as a type check to assert that we can actually pass a key and cert in
await start(manifest, { ...config, key: "test", cert: "test" });

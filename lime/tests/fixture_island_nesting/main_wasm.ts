// Copyright 2023 the cool authors. All rights reserved. MIT license.

// Simulate Deno Deploy environment

/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />

import "./polyfill_deno_deploy.ts";
import { start } from "../../server.ts";
import { manifest } from "./manifest.gen.ts";

await start(manifest);

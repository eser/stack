// Copyright 2023 the cool authors. All rights reserved. MIT license.

/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />

import { start } from "../../server.ts";
import { manifest } from "./manifest.gen.ts";

await start(manifest, { plugins: [] });

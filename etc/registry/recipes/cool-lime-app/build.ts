// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as collector from "@eser/collector";

await collector.buildManifest(
  Deno.stdout.writable,
  {
    baseDir: import.meta.dirname ?? ".",
    globFilter: "pkg/**/*",
  },
);

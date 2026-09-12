// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * This package's view of the Go bridge.
 *
 * The loader itself lives in `@eserstack/ajan/ffi/client` and is shared with
 * every other package, so the whole process opens the library once. This module
 * stays as the import path the package's own code already uses.
 *
 * Logging is the one caller that needs the SYNCHRONOUS accessor: `Logger.log`
 * reaches the bridge on a hot path that cannot await a load. It is exported
 * under the name `requireLib` that this package's call sites already use.
 */

import { ensureLib } from "@eserstack/ajan/ffi/client";

export {
  ensureLib,
  getLib,
  getLoadError,
  requireLibSync as requireLib,
} from "@eserstack/ajan/ffi/client";

// Loaded at module init, not on first log call, so Deno's per-test resource
// sanitizer does not attribute the dlopen to whichever test happens to log
// first.
await ensureLib();

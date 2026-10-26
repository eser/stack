// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * This package's view of the Go bridge.
 *
 * The loader itself lives in `@eserstack/ajan/ffi/client` and is shared with
 * every other package, so the whole process opens the library once. This module
 * stays as the import path the package's own code already uses.
 *
 * Importing this module opens nothing. The library loads on the first
 * `ensureLib()` call, which `Logger` makes before its first record goes to the
 * bridge.
 *
 * Logging is the one caller that needs the synchronous accessor: `Logger.log`
 * reaches the bridge on a hot path that cannot await a load. It is exported
 * under the name `requireLib` that this package's call sites already use, and
 * those call sites only reach it after `ensureLib()` has settled.
 *
 * @module
 */

export {
  ensureLib,
  getLib,
  getLoadError,
  requireLibSync as requireLib,
} from "@eserstack/ajan/ffi/client";

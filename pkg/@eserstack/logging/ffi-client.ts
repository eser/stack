// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * This package's view of the Go bridge.
 *
 * The loader itself lives in `@eserstack/ajan/ffi/client` and is shared with
 * every other package, so the whole process opens the library once. This module
 * stays as the import path the package's own code already uses.
 *
 * Importing this module opens nothing. The library loads synchronously on the
 * first record a `Logger` writes or the first category it resolves
 * (`ensureLibSync()`), or on `createGoLogger()` (`ensureLib()`).
 *
 * The logging hot path cannot await a load, so `Logger` uses the synchronous
 * loader. `requireLibSync` is exported under the name `requireLib` that this
 * package's call sites already use; it throws the bridge's load error, which
 * `Logger` catches to fall back to its console sink.
 *
 * @module
 */

export {
  ensureLib,
  ensureLibSync,
  getLib,
  getLoadError,
  requireLibSync as requireLib,
} from "@eserstack/ajan/ffi/client";

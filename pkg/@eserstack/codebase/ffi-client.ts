// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * This package's view of the Go bridge.
 *
 * The loader itself lives in `@eserstack/ajan/ffi/client` and is shared with
 * every other package, so the whole process opens the library once. This module
 * stays as the import path the package's own code already uses.
 *
 * `requireLib` is the async form here: codebase call sites are already async
 * and want the load awaited rather than assumed.
 */

export {
  ensureLib,
  getLib,
  getLoadError,
  requireLib,
} from "@eserstack/ajan/ffi/client";

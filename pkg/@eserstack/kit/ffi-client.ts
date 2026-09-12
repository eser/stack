// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * This package's view of the Go bridge.
 *
 * The loader itself lives in `@eserstack/ajan/ffi/client` and is shared with
 * every other package, so the whole process opens the library once. This module
 * stays as the import path the package's own code already uses.
 */

import { ensureLib } from "@eserstack/ajan/ffi/client";

export { ensureLib, getLib, getLoadError } from "@eserstack/ajan/ffi/client";

// Start the load at import time without awaiting it. kit's own entry points
// await ensureLib() before touching the library; this only lets the open
// overlap with whatever the caller does first.
void ensureLib();

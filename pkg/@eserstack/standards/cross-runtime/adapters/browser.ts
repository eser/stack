// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Browser runtime adapter.
 * Provides a minimal runtime implementation for browser environments.
 * No Node.js or platform-specific imports - safe for bundling.
 *
 * @module
 */

import type { Runtime, RuntimeCapabilities } from "../types.ts";
import * as path from "../polyfills/path.ts";
import * as shared from "./shared.ts";

/**
 * Browser capabilities - very limited, no system access.
 */
export const BROWSER_CAPABILITIES: RuntimeCapabilities = {
  fs: false,
  fsSync: false,
  exec: false,
  process: false,
  env: false,
  stdin: false,
  stdout: false,
  http: false,
} as const;

/**
 * Creates a browser runtime instance.
 */
export const createBrowserRuntime = (): Runtime => ({
  name: "browser",
  version: globalThis.navigator?.userAgent ?? "unknown",
  capabilities: BROWSER_CAPABILITIES,
  fs: shared.createStubFs("browser"),
  path: path.posixPath,
  exec: shared.createStubExec("browser"),
  env: shared.createStubEnv(),
  process: shared.createStubProcess("browser"),
  http: shared.createStubHttp("browser"),
});

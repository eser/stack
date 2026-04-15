// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Browser runtime adapter.
 * Provides a minimal runtime implementation for browser environments.
 * No Node.js or platform-specific imports - safe for bundling.
 *
 * @module
 */

import type { Runtime, RuntimeCapabilities } from "../types.ts";
import { posixPath } from "../polyfills/path.ts";
import {
  createStubEnv,
  createStubExec,
  createStubFs,
  createStubProcess,
} from "./shared.ts";

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
  kv: false,
} as const;

/**
 * Creates a browser runtime instance.
 */
export const createBrowserRuntime = (): Runtime => ({
  name: "browser",
  version: globalThis.navigator?.userAgent ?? "unknown",
  capabilities: BROWSER_CAPABILITIES,
  fs: createStubFs("browser"),
  path: posixPath,
  exec: createStubExec("browser"),
  env: createStubEnv(),
  process: createStubProcess("browser"),
});

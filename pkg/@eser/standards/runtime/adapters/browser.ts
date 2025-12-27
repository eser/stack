// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Browser runtime adapter.
 * Provides a minimal runtime implementation for browser environments.
 * No Node.js or platform-specific imports - safe for bundling.
 *
 * @module
 */

import type {
  Runtime,
  RuntimeCapabilities,
  RuntimeEnv,
  RuntimeExec,
  RuntimeFs,
  RuntimeProcess,
} from "../types.ts";
import { RuntimeCapabilityError } from "../types.ts";
import { posixPath } from "../polyfills/path.ts";

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
 * Creates a throw function for a specific capability.
 */
const createThrowFn = (capability: keyof RuntimeCapabilities): () => never => {
  return () => {
    throw new RuntimeCapabilityError(capability, "browser");
  };
};

/**
 * Creates a stub filesystem adapter that throws on all operations.
 */
const createBrowserFs = (): RuntimeFs => {
  const throwFs = createThrowFn("fs");
  return {
    readFile: throwFs,
    readTextFile: throwFs,
    writeFile: throwFs,
    writeTextFile: throwFs,
    exists: throwFs,
    stat: throwFs,
    lstat: throwFs,
    mkdir: throwFs,
    remove: throwFs,
    readDir: throwFs,
    copyFile: throwFs,
    rename: throwFs,
    makeTempDir: throwFs,
  };
};

/**
 * Creates a stub exec adapter that throws on all operations.
 */
const createBrowserExec = (): RuntimeExec => {
  const throwExec = createThrowFn("exec");
  return {
    spawn: throwExec,
    exec: throwExec,
    execJson: throwExec,
    spawnChild: throwExec,
  };
};

/**
 * Creates a stub process adapter that throws on all operations.
 */
const createBrowserProcess = (): RuntimeProcess => {
  const throwProcess = createThrowFn("process");
  return {
    exit: throwProcess,
    cwd: throwProcess,
    chdir: throwProcess,
    hostname: throwProcess,
    execPath: throwProcess,
    get args(): readonly string[] {
      throw new RuntimeCapabilityError("process", "browser");
    },
    get pid(): number {
      throw new RuntimeCapabilityError("process", "browser");
    },
    get stdin(): ReadableStream<Uint8Array> {
      throw new RuntimeCapabilityError("process", "browser");
    },
    get stdout(): WritableStream<Uint8Array> {
      throw new RuntimeCapabilityError("process", "browser");
    },
    get stderr(): WritableStream<Uint8Array> {
      throw new RuntimeCapabilityError("process", "browser");
    },
  };
};

/**
 * Creates a no-op env adapter for browser environments.
 */
const createBrowserEnv = (): RuntimeEnv => ({
  get: () => undefined,
  set: () => {},
  delete: () => {},
  has: () => false,
  toObject: () => ({}),
});

/**
 * Creates a browser runtime instance.
 */
export const createBrowserRuntime = (): Runtime => ({
  name: "browser",
  version: globalThis.navigator?.userAgent ?? "unknown",
  capabilities: BROWSER_CAPABILITIES,
  fs: createBrowserFs(),
  path: posixPath,
  exec: createBrowserExec(),
  env: createBrowserEnv(),
  process: createBrowserProcess(),
});

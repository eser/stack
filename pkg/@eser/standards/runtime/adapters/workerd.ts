// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Cloudflare Workers (workerd) runtime adapter.
 * Implements the Runtime interface with limited capabilities.
 *
 * Note: Cloudflare Workers has no filesystem or process execution capabilities.
 * Environment variables are typically passed through the handler context, not globals.
 *
 * @module
 */

import type {
  Runtime,
  RuntimeCapabilities,
  RuntimeEnv,
  RuntimeExec,
  RuntimeFs,
  RuntimePath,
  RuntimeProcess,
} from "../types.ts";
import { RuntimeCapabilityError } from "../types.ts";

/**
 * Cloudflare Workers capabilities - very limited.
 * No filesystem, no process execution, env is handler-scoped.
 */
export const WORKERD_CAPABILITIES: RuntimeCapabilities = {
  fs: false,
  fsSync: false,
  exec: false,
  process: false,
  env: true, // Available via handler context
  stdin: false,
  stdout: false,
  kv: true, // Cloudflare KV bindings
} as const;
import { posixPath } from "../polyfills/path.ts";

// =============================================================================
// Filesystem Adapter (Not Available)
// =============================================================================

const createWorkerdFs = (): RuntimeFs => {
  const throwNotAvailable = (): never => {
    throw new RuntimeCapabilityError("fs", "workerd");
  };

  return {
    readFile: throwNotAvailable,
    readTextFile: throwNotAvailable,
    writeFile: throwNotAvailable,
    writeTextFile: throwNotAvailable,
    exists: throwNotAvailable,
    stat: throwNotAvailable,
    lstat: throwNotAvailable,
    mkdir: throwNotAvailable,
    remove: throwNotAvailable,
    readDir: () => {
      throw new RuntimeCapabilityError("fs", "workerd");
    },
    copyFile: throwNotAvailable,
    rename: throwNotAvailable,
    makeTempDir: throwNotAvailable,
  };
};

// =============================================================================
// Path Adapter (Polyfilled)
// =============================================================================

const createWorkerdPath = (): RuntimePath => {
  // Use the pure JS polyfill since Workers has no path module
  return posixPath;
};

// =============================================================================
// Exec Adapter (Not Available)
// =============================================================================

const createWorkerdExec = (): RuntimeExec => {
  const throwNotAvailable = (): never => {
    throw new RuntimeCapabilityError("exec", "workerd");
  };

  return {
    spawn: throwNotAvailable,
    exec: throwNotAvailable,
    execJson: throwNotAvailable,
    spawnChild: throwNotAvailable,
  };
};

// =============================================================================
// Environment Adapter
// =============================================================================

/**
 * Environment variable storage for Workers.
 * In Workers, env vars are typically passed via the handler context.
 * This adapter allows setting env vars that will be available within the runtime.
 */
const envStorage = new Map<string, string>();

const createWorkerdEnv = (): RuntimeEnv => {
  return {
    get(key: string): string | undefined {
      return envStorage.get(key);
    },

    set(key: string, value: string): void {
      envStorage.set(key, value);
    },

    delete(key: string): void {
      envStorage.delete(key);
    },

    has(key: string): boolean {
      return envStorage.has(key);
    },

    toObject(): Record<string, string> {
      return Object.fromEntries(envStorage);
    },
  };
};

/**
 * Populate the environment from a Workers handler context.
 * Call this at the start of your fetch handler.
 *
 * @example
 * ```typescript
 * export default {
 *   async fetch(request: Request, env: Env) {
 *     populateEnvFromContext(env);
 *     // Now runtime.env.get("MY_SECRET") works
 *   }
 * }
 * ```
 */
export const populateEnvFromContext = (
  env: Record<string, unknown>,
): void => {
  for (const [key, value] of Object.entries(env)) {
    if (value !== null && value !== undefined && value.constructor === String) {
      envStorage.set(key, value as string);
    }
  }
};

/**
 * Clear all environment variables.
 * Useful between requests if needed.
 */
export const clearEnv = (): void => {
  envStorage.clear();
};

// =============================================================================
// Process Adapter (Not Available)
// =============================================================================

const createWorkerdProcess = (): RuntimeProcess => {
  const throwNotAvailable = (): never => {
    throw new RuntimeCapabilityError("process", "workerd");
  };

  return {
    exit: throwNotAvailable,
    cwd: throwNotAvailable,
    chdir: throwNotAvailable,
    hostname: throwNotAvailable,
    execPath: throwNotAvailable,
    get args(): readonly string[] {
      throw new RuntimeCapabilityError("process", "workerd");
    },
    get pid(): number {
      throw new RuntimeCapabilityError("process", "workerd");
    },
    get stdin(): ReadableStream<Uint8Array> {
      throw new RuntimeCapabilityError("process", "workerd");
    },
    get stdout(): WritableStream<Uint8Array> {
      throw new RuntimeCapabilityError("process", "workerd");
    },
    get stderr(): WritableStream<Uint8Array> {
      throw new RuntimeCapabilityError("process", "workerd");
    },
  };
};

// =============================================================================
// Runtime Factory
// =============================================================================

/**
 * Creates a Cloudflare Workers runtime instance.
 *
 * Note: This runtime has very limited capabilities:
 * - No filesystem access (use KV, R2, or D1 bindings instead)
 * - No process execution
 * - Environment is managed through populateEnvFromContext()
 */
export const createWorkerdRuntime = (): Runtime => {
  const fs = createWorkerdFs();
  const path = createWorkerdPath();
  const exec = createWorkerdExec();
  const env = createWorkerdEnv();
  const process = createWorkerdProcess();

  return {
    name: "workerd",
    version: "unknown", // Workers doesn't expose version
    capabilities: WORKERD_CAPABILITIES as RuntimeCapabilities,
    fs,
    path,
    exec,
    env,
    process,
  };
};

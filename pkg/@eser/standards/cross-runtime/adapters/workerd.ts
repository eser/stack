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

import type { Runtime, RuntimeCapabilities, RuntimeEnv } from "../types.ts";
import { posixPath } from "../polyfills/path.ts";
import { createStubExec, createStubFs, createStubProcess } from "./shared.ts";

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

// =============================================================================
// Environment Adapter (Workerd-specific)
// =============================================================================

const envStorage = new Map<string, string>();

const createWorkerdEnv = (): RuntimeEnv => ({
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
});

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
// Runtime Factory
// =============================================================================

/**
 * Creates a Cloudflare Workers runtime instance.
 * Composes: shared stubs (fs, exec, process) + workerd-specific env.
 */
export const createWorkerdRuntime = (): Runtime => ({
  name: "workerd",
  version: "unknown",
  capabilities: WORKERD_CAPABILITIES as RuntimeCapabilities,
  fs: createStubFs("workerd"),
  path: posixPath,
  exec: createStubExec("workerd"),
  env: createWorkerdEnv(),
  process: createStubProcess("workerd"),
});

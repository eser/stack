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
import * as path from "../polyfills/path.ts";
import * as shared from "./shared.ts";

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
  http: false, // A Worker answers requests through its fetch export
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
 * import * as standards from "@eserstack/standards";
 * import { runtime } from "@eserstack/standards/cross-runtime";
 *
 * type Env = { readonly MY_SECRET: string };
 *
 * export default {
 *   fetch(_request: Request, env: Env): Response {
 *     standards.crossRuntime.populateEnvFromContext(env);
 *     // Now runtime.env.get("MY_SECRET") works
 *     const configured = runtime.env.get("MY_SECRET") !== undefined;
 *     return new Response(configured ? "ready" : "MY_SECRET is not bound");
 *   },
 * };
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
 * Composes: shared stubs (fs, exec, process, http) + workerd-specific env.
 */
export const createWorkerdRuntime = (): Runtime => ({
  name: "workerd",
  version: "unknown",
  capabilities: WORKERD_CAPABILITIES as RuntimeCapabilities,
  fs: shared.createStubFs("workerd"),
  path: path.posixPath,
  exec: shared.createStubExec("workerd"),
  env: createWorkerdEnv(),
  process: shared.createStubProcess("workerd"),
  http: shared.createStubHttp("workerd"),
});

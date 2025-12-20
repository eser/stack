// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Runtime capability definitions.
 *
 * @module
 */

import type { RuntimeCapabilities, RuntimeName } from "./types.ts";

/**
 * Full capabilities - available on Deno, Node.js, and Bun.
 */
export const FULL_CAPABILITIES: RuntimeCapabilities = {
  fs: true,
  fsSync: true,
  exec: true,
  process: true,
  env: true,
  stdin: true,
  stdout: true,
  kv: false,
} as const;

/**
 * Deno capabilities - full capabilities plus KV.
 */
export const DENO_CAPABILITIES: RuntimeCapabilities = {
  fs: true,
  fsSync: true,
  exec: true,
  process: true,
  env: true,
  stdin: true,
  stdout: true,
  kv: true,
} as const;

/**
 * Node.js capabilities - full capabilities, no native KV.
 */
export const NODE_CAPABILITIES: RuntimeCapabilities = {
  fs: true,
  fsSync: true,
  exec: true,
  process: true,
  env: true,
  stdin: true,
  stdout: true,
  kv: false,
} as const;

/**
 * Bun capabilities - full capabilities, no native KV.
 */
export const BUN_CAPABILITIES: RuntimeCapabilities = {
  fs: true,
  fsSync: true,
  exec: true,
  process: true,
  env: true,
  stdin: true,
  stdout: true,
  kv: false,
} as const;

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

/**
 * Browser capabilities - very limited.
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
 * Unknown runtime capabilities - assume nothing.
 */
export const UNKNOWN_CAPABILITIES: RuntimeCapabilities = {
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
 * Get capabilities for a specific runtime.
 *
 * @param runtime - The runtime name
 * @returns Capability flags for that runtime
 */
export const getCapabilities = (runtime: RuntimeName): RuntimeCapabilities => {
  switch (runtime) {
    case "deno":
      return DENO_CAPABILITIES;
    case "node":
      return NODE_CAPABILITIES;
    case "bun":
      return BUN_CAPABILITIES;
    case "workerd":
      return WORKERD_CAPABILITIES;
    case "browser":
      return BROWSER_CAPABILITIES;
    default:
      return UNKNOWN_CAPABILITIES;
  }
};

/**
 * Check if a specific capability is available.
 *
 * @param runtime - The runtime name
 * @param capability - The capability to check
 * @returns True if the capability is available
 */
export const hasCapability = (
  runtime: RuntimeName,
  capability: keyof RuntimeCapabilities,
): boolean => {
  return getCapabilities(runtime)[capability];
};

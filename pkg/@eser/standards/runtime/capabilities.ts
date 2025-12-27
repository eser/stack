// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Runtime capability definitions.
 *
 * Platform-agnostic capabilities are defined here.
 * Runtime-specific capabilities are defined in their respective adapters.
 *
 * @module
 */

import type { RuntimeCapabilities, RuntimeName } from "./types.ts";
import { DENO_CAPABILITIES } from "./adapters/deno.ts";
import { NODE_CAPABILITIES } from "./adapters/node.ts";
import { BUN_CAPABILITIES } from "./adapters/bun.ts";
import { WORKERD_CAPABILITIES } from "./adapters/workerd.ts";

// Re-export runtime-specific capabilities for backward compatibility
export { DENO_CAPABILITIES } from "./adapters/deno.ts";
export { NODE_CAPABILITIES } from "./adapters/node.ts";
export { BUN_CAPABILITIES } from "./adapters/bun.ts";
export { WORKERD_CAPABILITIES } from "./adapters/workerd.ts";

/**
 * Full capabilities - template for full-featured runtimes.
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

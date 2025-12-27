// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Cloudflare Workers (workerd) runtime entry point.
 *
 * @example
 * ```typescript
 * import { isWorkerd, createWorkerdRuntime } from "@eser/standards/runtime/workerd";
 *
 * if (isWorkerd()) {
 *   const runtime = createWorkerdRuntime();
 *   // Use limited capabilities available in Workers
 * }
 * ```
 *
 * @module
 */

// Detection utilities
export {
  detectRuntime,
  getRuntimeVersion,
  isBrowser,
  isBun,
  isDeno,
  isEdge,
  isNode,
  isServer,
  isWorkerd,
} from "./detect.ts";

// Workerd adapter
export {
  clearEnv,
  createWorkerdRuntime,
  populateEnvFromContext,
  WORKERD_CAPABILITIES,
} from "./adapters/workerd.ts";

// Re-export all types
export type {
  Arch,
  CreateRuntimeOptions,
  ParsedPath,
  Platform,
  PlatformInfo,
  Runtime,
  RuntimeCapabilities,
  RuntimeEnv,
  RuntimeName,
  RuntimePath,
} from "./types.ts";

// Re-export errors
export { RuntimeCapabilityError } from "./types.ts";

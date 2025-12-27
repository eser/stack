// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Browser runtime entry point.
 * Lightweight module for browser environments - no Node.js dependencies.
 *
 * @example
 * ```typescript
 * import { isBrowser, createBrowserRuntime } from "@eser/standards/runtime/browser";
 *
 * if (isBrowser()) {
 *   const runtime = createBrowserRuntime();
 *   // Use runtime.path for path operations
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

// Browser adapter
export {
  BROWSER_CAPABILITIES,
  createBrowserRuntime,
} from "./adapters/browser.ts";

// Path utilities (browser-safe)
export { posixPath } from "./polyfills/path.ts";

// Re-export types
export type {
  Arch,
  CreateRuntimeOptions,
  ParsedPath,
  Platform,
  PlatformInfo,
  Runtime,
  RuntimeCapabilities,
  RuntimeName,
  RuntimePath,
} from "./types.ts";

// Re-export errors
export { RuntimeCapabilityError } from "./types.ts";

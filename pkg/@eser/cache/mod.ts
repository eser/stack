// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Cache management utilities with XDG-compliant directory structure.
 *
 * Provides cross-platform cache storage that follows:
 * - XDG Base Directory Specification on Linux
 * - Platform conventions on macOS (`~/Library/Caches`)
 * - Platform conventions on Windows (`%LOCALAPPDATA%`)
 *
 * @example
 * ```typescript
 * import { createCacheManager } from "@eser/cache";
 *
 * // Create a cache manager for your application
 * const cache = createCacheManager({
 *   app: { name: "my-cli", org: "eser" }
 * });
 *
 * // Get versioned cache path
 * const binaryPath = cache.getVersionedPath("1.0.0", "binary");
 *
 * // Check if cached item exists
 * if (await cache.exists(binaryPath)) {
 *   console.log("Using cached binary");
 * } else {
 *   await cache.ensureDir(runtime.path.dirname(binaryPath));
 *   // Download and cache...
 * }
 *
 * // List cached items
 * const entries = await cache.list();
 *
 * // Clear cache
 * await cache.clear();
 * ```
 *
 * @example
 * ```typescript
 * // Direct XDG directory access
 * import * as xdg from "@eser/cache/xdg";
 *
 * const cacheHome = xdg.getXdgCacheHome();
 * const dataHome = xdg.getXdgDataHome();
 * const configHome = xdg.getXdgConfigHome();
 * ```
 *
 * @module
 */

// Re-export types
export type {
  AppIdentifier,
  CacheEntry,
  CacheManager,
  CacheManagerOptions,
} from "./primitives.ts";

// Re-export cache manager factory
export { createCacheManager } from "./cache.ts";

// Re-export XDG utilities
export {
  getAppCacheDir,
  getVersionedCachePath,
  getXdgCacheHome,
  getXdgConfigHome,
  getXdgDataHome,
} from "./xdg.ts";

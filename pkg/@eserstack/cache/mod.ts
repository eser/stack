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
 * import * as cache from "@eserstack/cache";
 * import { runtime } from "@eserstack/standards/cross-runtime";
 *
 * // Create a cache manager for your application
 * const manager = cache.createCacheManager({
 *   app: { name: "my-cli", org: "eser" }
 * });
 *
 * // Get versioned cache path
 * const binaryPath = manager.getVersionedPath("1.0.0", "binary");
 *
 * // Check if cached item exists
 * if (await manager.exists(binaryPath)) {
 *   console.log("Using cached binary");
 * } else {
 *   await manager.ensureDir(runtime.path.dirname(binaryPath));
 *   // Download and cache...
 * }
 *
 * // List cached items
 * const entries = await manager.list();
 *
 * // Clear cache
 * await manager.clear();
 * ```
 *
 * @example
 * ```typescript
 * // Direct XDG directory access
 * import * as cache from "@eserstack/cache";
 *
 * const cacheHome = cache.getXdgCacheHome();
 * const dataHome = cache.getXdgDataHome();
 * const configHome = cache.getXdgConfigHome();
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

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Cache manager implementation.
 *
 * Provides versioned cache storage with XDG-compliant directory structure.
 *
 * @example
 * ```typescript
 * import { createCacheManager } from "@eser/cache";
 *
 * const cache = createCacheManager({
 *   app: { name: "my-cli", org: "eser" }
 * });
 *
 * // Get versioned cache path
 * const binaryPath = cache.getVersionedPath("1.0.0", "binary");
 *
 * // Ensure directory exists
 * await cache.ensureDir(runtime.path.dirname(binaryPath));
 *
 * // Check if cached
 * if (await cache.exists(binaryPath)) {
 *   console.log("Using cached binary");
 * }
 * ```
 *
 * @module
 */

import * as standardsRuntime from "@eser/standards/runtime";
import type {
  CacheEntry,
  CacheManager,
  CacheManagerOptions,
} from "./primitives.ts";
import * as xdg from "./xdg.ts";

/**
 * Creates a cache manager for the specified application.
 *
 * @param options - Cache manager configuration
 * @returns A CacheManager instance
 *
 * @example
 * ```typescript
 * const cache = createCacheManager({
 *   app: { name: "my-cli", org: "eser" }
 * });
 *
 * const path = cache.getVersionedPath("1.0.0", "binary");
 * // On Linux: ~/.cache/eser/my-cli/v1.0.0/binary
 * // On macOS: ~/Library/Caches/eser/my-cli/v1.0.0/binary
 * ```
 */
export const createCacheManager = (
  options: CacheManagerOptions,
): CacheManager => {
  const { app, baseDir } = options;

  const getCacheDir = (): string => {
    if (baseDir) {
      if (app.org) {
        return standardsRuntime.runtime.path.join(baseDir, app.org, app.name);
      }
      return standardsRuntime.runtime.path.join(baseDir, app.name);
    }
    return xdg.getAppCacheDir(app);
  };

  const resolvePath = (path: string): string => {
    if (standardsRuntime.runtime.path.isAbsolute(path)) {
      return path;
    }
    return standardsRuntime.runtime.path.join(getCacheDir(), path);
  };

  const getVersionedPath = (version: string, name: string): string => {
    if (baseDir) {
      // Normalize version to always have 'v' prefix
      const normalizedVersion = version.startsWith("v")
        ? version
        : `v${version}`;
      return standardsRuntime.runtime.path.join(
        getCacheDir(),
        normalizedVersion,
        name,
      );
    }
    return xdg.getVersionedCachePath(app, version, name);
  };

  const exists = async (path: string): Promise<boolean> => {
    const resolvedPath = resolvePath(path);
    return await standardsRuntime.runtime.fs.exists(resolvedPath);
  };

  const ensureDir = async (path: string): Promise<void> => {
    const resolvedPath = resolvePath(path);
    await standardsRuntime.runtime.fs.mkdir(resolvedPath, { recursive: true });
  };

  const list = async (): Promise<CacheEntry[]> => {
    const cacheDir = getCacheDir();
    const entries: CacheEntry[] = [];

    try {
      const dirExists = await standardsRuntime.runtime.fs.exists(cacheDir);
      if (!dirExists) {
        return entries;
      }

      for await (const entry of standardsRuntime.runtime.fs.readDir(cacheDir)) {
        const entryPath = standardsRuntime.runtime.path.join(
          cacheDir,
          entry.name,
        );

        let size = 0;
        let mtime: Date | null = null;

        try {
          const stat = await standardsRuntime.runtime.fs.stat(entryPath);
          size = stat.size;
          mtime = stat.mtime;
        } catch {
          // Ignore stat errors
        }

        entries.push({
          path: entry.name,
          name: entry.name,
          isDirectory: entry.isDirectory,
          size,
          mtime,
        });
      }
    } catch {
      // Return empty if directory doesn't exist or can't be read
    }

    return entries;
  };

  const remove = async (path: string): Promise<void> => {
    const resolvedPath = resolvePath(path);

    try {
      await standardsRuntime.runtime.fs.remove(resolvedPath, {
        recursive: true,
      });
    } catch {
      // Ignore if path doesn't exist
    }
  };

  const clear = async (): Promise<void> => {
    const cacheDir = getCacheDir();

    try {
      await standardsRuntime.runtime.fs.remove(cacheDir, { recursive: true });
    } catch {
      // Ignore if directory doesn't exist
    }
  };

  return {
    getCacheDir,
    getVersionedPath,
    exists,
    ensureDir,
    list,
    remove,
    clear,
  };
};

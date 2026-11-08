// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Cache manager implementation.
 *
 * Provides versioned cache storage with XDG-compliant directory structure.
 * Delegates the path resolution and the filesystem operations to Go
 * (`pkg/ajan/cachefx`) through the `@eserstack/ajan` bridge; without the
 * bridge they throw or reject with its load error.
 *
 * @example
 * ```typescript
 * import * as cache from "@eserstack/cache";
 * import { runtime } from "@eserstack/standards/cross-runtime";
 *
 * const manager = cache.createCacheManager({
 *   app: { name: "my-cli", org: "eser" }
 * });
 *
 * // Get versioned cache path
 * const binaryPath = manager.getVersionedPath("1.0.0", "binary");
 *
 * // Ensure directory exists
 * await manager.ensureDir(runtime.path.dirname(binaryPath));
 *
 * // Check if cached
 * if (await manager.exists(binaryPath)) {
 *   console.log("Using cached binary");
 * }
 * ```
 *
 * @module
 */

import type {
  CacheEntry,
  CacheManager,
  CacheManagerOptions,
} from "./primitives.ts";
import * as ffiClient from "./ffi-client.ts";
import * as host from "./host.ts";

/**
 * Creates a cache manager for the specified application.
 *
 * @param options - Cache manager configuration
 * @returns A CacheManager instance
 *
 * @example
 * ```typescript
 * import * as cache from "@eserstack/cache";
 *
 * const manager = cache.createCacheManager({
 *   app: { name: "my-cli", org: "eser" }
 * });
 *
 * const path = manager.getVersionedPath("1.0.0", "binary");
 * // On Linux: ~/.cache/eser/my-cli/v1.0.0/binary
 * // On macOS: ~/Library/Caches/eser/my-cli/v1.0.0/binary
 * ```
 */
export const createCacheManager = (
  options: CacheManagerOptions,
): CacheManager => {
  const { app, baseDir } = options;

  // Go handle for this cache instance (created lazily on first async operation).
  let _handlePromise: Promise<string> | null = null;

  const getHandle = (): Promise<string> => {
    if (_handlePromise === null) {
      _handlePromise = ffiClient.requireLib().then((lib) => {
        const result = lib.call("cacheCreate", {
          app: { name: app.name, org: app.org },
          baseDir,
          host: host.currentHost(),
        });
        if (result.error) {
          throw new Error(result.error);
        }
        return result.handle ?? "";
      });
    }
    return _handlePromise;
  };

  // Sync methods: Go resolves the paths through the bridge, which loads
  // synchronously on first use.
  const getCacheDir = (): string =>
    host.resolveAppPaths({ app, baseDir }).appDir;

  const getVersionedPath = (version: string, name: string): string =>
    host.resolveAppPaths({ app, baseDir, version, item: name }).versionedPath;

  // Go resolves a relative path against the cache directory.
  const exists = async (path: string): Promise<boolean> => {
    const handle = await getHandle();
    const lib = ffiClient.getLib()!;
    const result = lib.call("cacheExists", { handle, path });
    if (result.error) {
      throw new Error(result.error);
    }
    return result.exists === true;
  };

  const ensureDir = async (path: string): Promise<void> => {
    const handle = await getHandle();
    const lib = ffiClient.getLib()!;
    const result = lib.call("cacheEnsureDir", { handle, path });
    if (result.error) {
      throw new Error(result.error);
    }
  };

  const list = async (): Promise<CacheEntry[]> => {
    const handle = await getHandle();
    const lib = ffiClient.getLib()!;
    const result = lib.call("cacheList", { handle }) as {
      entries: Array<{
        path: string;
        name: string;
        isDirectory: boolean;
        size: number;
        mtimeUnix: number;
      }>;
      error?: string;
    };
    if (result.error) {
      throw new Error(result.error);
    }
    return (result.entries ?? []).map((e) => ({
      path: e.path,
      name: e.name,
      isDirectory: e.isDirectory,
      size: e.size,
      mtime: e.mtimeUnix ? new Date(e.mtimeUnix * 1000) : null,
    }));
  };

  const remove = async (path: string): Promise<void> => {
    const handle = await getHandle();
    const lib = ffiClient.getLib()!;
    const result = lib.call("cacheRemove", { handle, path });
    if (result.error) {
      throw new Error(result.error);
    }
  };

  const clear = async (): Promise<void> => {
    const handle = await getHandle();
    const lib = ffiClient.getLib()!;
    const result = lib.call("cacheClear", { handle });
    if (result.error) {
      throw new Error(result.error);
    }
  };

  // Reset _handlePromise to null BEFORE calling Go so a concurrent second close
  // sees null and returns early rather than closing an already-freed handle.
  const close = async (): Promise<void> => {
    if (_handlePromise === null) return;
    let handle: string;
    try {
      handle = await _handlePromise;
    } catch {
      _handlePromise = null;
      return;
    }
    _handlePromise = null;
    const lib = ffiClient.getLib();
    if (lib !== null) {
      lib.call("cacheClose", { handle });
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
    close,
    [Symbol.asyncDispose]: close,
  };
};

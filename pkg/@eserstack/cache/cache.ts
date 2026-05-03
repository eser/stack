// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Cache manager implementation.
 *
 * Provides versioned cache storage with XDG-compliant directory structure.
 * Delegates filesystem operations to the native Go library.
 *
 * @example
 * ```typescript
 * import { createCacheManager } from "@eserstack/cache";
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

import { runtime } from "@eserstack/standards/cross-runtime";
import type {
  CacheEntry,
  CacheManager,
  CacheManagerOptions,
} from "./primitives.ts";
import * as xdg from "./xdg.ts";
import { ensureLib, getLib } from "./ffi-client.ts";

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

  // Go handle for this cache instance (created lazily on first async operation).
  let _handlePromise: Promise<string> | null = null;

  const getHandle = (): Promise<string> => {
    if (_handlePromise === null) {
      _handlePromise = ensureLib().then(() => {
        const lib = getLib();
        if (lib === null) {
          throw new Error("native library unavailable");
        }
        const raw = lib.symbols.EserAjanCacheCreate(
          JSON.stringify({ app: { name: app.name, org: app.org }, baseDir }),
        );
        const result = JSON.parse(raw) as { handle: string; error?: string };
        if (result.error) {
          throw new Error(result.error);
        }
        return result.handle;
      });
    }
    return _handlePromise;
  };

  // Sync methods: path computation stays in TS (interface requires sync return)
  const getCacheDir = (): string => {
    if (baseDir) {
      if (app.org) {
        return runtime.path.join(baseDir, app.org, app.name);
      }
      return runtime.path.join(baseDir, app.name);
    }
    return xdg.getAppCacheDir(app);
  };

  const resolvePath = (path: string): string => {
    if (runtime.path.isAbsolute(path)) {
      return path;
    }
    return runtime.path.join(getCacheDir(), path);
  };

  const getVersionedPath = (version: string, name: string): string => {
    if (baseDir) {
      const normalizedVersion = version.startsWith("v") ? version : `v${version}`;
      return runtime.path.join(getCacheDir(), normalizedVersion, name);
    }
    return xdg.getVersionedCachePath(app, version, name);
  };

  // Filesystem existence/mkdir stay in TS: no Go FFI equivalent
  const exists = (path: string): Promise<boolean> => {
    return runtime.fs.exists(resolvePath(path));
  };

  const ensureDir = async (path: string): Promise<void> => {
    await runtime.fs.mkdir(resolvePath(path), { recursive: true });
  };

  const list = async (): Promise<CacheEntry[]> => {
    const handle = await getHandle();
    const lib = getLib()!;
    const raw = lib.symbols.EserAjanCacheList(JSON.stringify({ handle }));
    const result = JSON.parse(raw) as {
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
    const lib = getLib()!;
    // Resolve to absolute path — Go's Manager.Remove calls os.RemoveAll(path)
    // directly (not relative to cache dir), so we must pass the absolute path.
    const raw = lib.symbols.EserAjanCacheRemove(
      JSON.stringify({ handle, path: resolvePath(path) }),
    );
    const result = JSON.parse(raw) as { error?: string };
    if (result.error) {
      throw new Error(result.error);
    }
  };

  const clear = async (): Promise<void> => {
    const handle = await getHandle();
    const lib = getLib()!;
    const raw = lib.symbols.EserAjanCacheClear(JSON.stringify({ handle }));
    const result = JSON.parse(raw) as { error?: string };
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
    const lib = getLib();
    if (lib !== null) {
      lib.symbols.EserAjanCacheClose(JSON.stringify({ handle }));
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

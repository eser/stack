// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Type definitions for cache management.
 *
 * @module
 */

/**
 * Application identifier for cache directories.
 */
export interface AppIdentifier {
  /** Application name (e.g., "my-cli") */
  readonly name: string;
  /** Organization name (optional, e.g., "eser") */
  readonly org?: string;
}

/**
 * Options for creating a cache manager.
 */
export interface CacheManagerOptions {
  /** Application identifier */
  readonly app: AppIdentifier;
  /** Custom base cache directory (overrides XDG default) */
  readonly baseDir?: string;
}

/**
 * Information about a cached entry.
 */
export interface CacheEntry {
  /** Entry path relative to cache root */
  readonly path: string;
  /** Entry name (filename or directory name) */
  readonly name: string;
  /** Whether this is a directory */
  readonly isDirectory: boolean;
  /** File size in bytes (0 for directories) */
  readonly size: number;
  /** Last modification time */
  readonly mtime: Date | null;
}

/**
 * Cache manager interface for managing versioned cache storage.
 */
export interface CacheManager {
  /**
   * Gets the base cache directory for this application.
   *
   * @returns Absolute path to the cache directory
   */
  getCacheDir(): string;

  /**
   * Gets a versioned path within the cache.
   * The version is normalized to always include 'v' prefix.
   *
   * @param version - Version string (e.g., "1.0.0" or "v1.0.0")
   * @param name - Name of the cached item
   * @returns Absolute path to the versioned cache location
   *
   * @example
   * ```typescript
   * const path = cache.getVersionedPath("1.0.0", "binary");
   * // Returns: ~/.cache/myapp/v1.0.0/binary
   * ```
   */
  getVersionedPath(version: string, name: string): string;

  /**
   * Checks if a path exists in the cache.
   *
   * @param path - Path to check (relative or absolute)
   * @returns True if the path exists
   */
  exists(path: string): Promise<boolean>;

  /**
   * Ensures a directory exists, creating it if necessary.
   *
   * @param path - Directory path to ensure exists
   */
  ensureDir(path: string): Promise<void>;

  /**
   * Lists all entries in the cache directory.
   *
   * @returns Array of cache entries
   */
  list(): Promise<CacheEntry[]>;

  /**
   * Removes a path from the cache.
   *
   * @param path - Path to remove
   */
  remove(path: string): Promise<void>;

  /**
   * Clears the entire cache directory.
   */
  clear(): Promise<void>;
}

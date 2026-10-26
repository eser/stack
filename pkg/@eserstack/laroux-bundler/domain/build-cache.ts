// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Build Cache for Incremental Builds
 * Provides mtime-based caching for expensive build operations
 */

import * as logging from "@eserstack/logging";
import * as buildValidator from "./build-validator.ts";
import type { RouteScanCache, ScanResult } from "./route-scanner.ts";

const cacheLogger = logging.logger.getLogger(["laroux-bundler", "build-cache"]);

/**
 * Cached client component analysis result
 */
export type ClientComponentCacheEntry = {
  isClient: boolean;
  exportNames: string[];
  mtime: number;
};

/**
 * Cached CSS module processing result
 */
export type CSSModuleCacheEntry = {
  code: string;
  exports: Record<string, string>;
  mtime: number;
};

/**
 * Cached route scan result of one routes directory
 */
export type RouteCacheEntry = {
  /** The scan result */
  readonly scan: ScanResult;
  /** Modification time of the routes directory when it was scanned */
  readonly mtime: number;
};

/**
 * Keeps the "use client" analysis of source files between builds. BuildCache
 * implements it; framework plugins receive it in analyzeClientComponents.
 */
export type ClientComponentCache = {
  /**
   * The cached analysis of filePath, or null when there is none or the file
   * changed after it (currentMtime is newer than the entry's).
   */
  getClientComponent(
    filePath: string,
    currentMtime: number,
  ): ClientComponentCacheEntry | null;
  /** Store the analysis of filePath, made when the file had this mtime. */
  setClientComponent(
    filePath: string,
    isClient: boolean,
    exportNames: string[],
    mtime: number,
  ): void;
};

/**
 * Build Cache Manager
 * Maintains caches across incremental builds in watch mode. Every entry is
 * keyed by an absolute path, so one cache can serve several projects.
 */
export class BuildCache implements ClientComponentCache, RouteScanCache {
  private clientComponentCache: Map<string, ClientComponentCacheEntry> =
    new Map();
  private cssModuleCache: Map<string, CSSModuleCacheEntry> = new Map();
  private routeScans: Map<string, RouteCacheEntry> = new Map();

  /**
   * Get cached client component analysis result
   * @param filePath - Absolute path to the component file
   * @param currentMtime - Current file modification time
   * @returns Cached entry if valid, null if cache miss or stale
   */
  getClientComponent(
    filePath: string,
    currentMtime: number,
  ): ClientComponentCacheEntry | null {
    const cached = this.clientComponentCache.get(filePath);
    if (cached && cached.mtime >= currentMtime) {
      cacheLogger.debug(`Cache hit: client component ${filePath}`);
      return cached;
    }
    return null;
  }

  /**
   * Set client component analysis result in cache
   */
  setClientComponent(
    filePath: string,
    isClient: boolean,
    exportNames: string[],
    mtime: number,
  ): void {
    this.clientComponentCache.set(filePath, { isClient, exportNames, mtime });
  }

  /**
   * Get cached CSS module processing result
   * @param cssPath - Absolute path to the CSS module file
   * @param currentMtime - Current file modification time
   * @returns Cached entry if valid, null if cache miss or stale
   */
  getCssModuleResult(
    cssPath: string,
    currentMtime: number,
  ): CSSModuleCacheEntry | null {
    const cached = this.cssModuleCache.get(cssPath);
    if (cached && cached.mtime >= currentMtime) {
      cacheLogger.debug(`Cache hit: CSS module ${cssPath}`);
      return cached;
    }
    return null;
  }

  /**
   * Set CSS module processing result in cache
   */
  setCssModuleResult(
    cssPath: string,
    code: string,
    exports: Record<string, string>,
    mtime: number,
  ): void {
    this.cssModuleCache.set(cssPath, { code, exports, mtime });
  }

  /**
   * Get the cached route scan of a routes directory
   * @param routesDir - Absolute path of the routes directory
   * @param routesDirMtime - Current modification time of the directory
   * @returns The scan if valid, null if cache miss or stale
   */
  getRouteScan(routesDir: string, routesDirMtime: number): ScanResult | null {
    const cached = this.routeScans.get(routesDir);
    if (cached !== undefined && cached.mtime >= routesDirMtime) {
      cacheLogger.debug(`Cache hit: route scan of ${routesDir}`);
      return cached.scan;
    }
    return null;
  }

  /**
   * Set the route scan of a routes directory in the cache
   */
  setRouteScan(
    routesDir: string,
    result: ScanResult,
    routesDirMtime: number,
  ): void {
    this.routeScans.set(routesDir, { scan: result, mtime: routesDirMtime });
  }

  /**
   * Invalidate cache entries for a specific file
   * Called when a file changes in watch mode
   */
  invalidateFile(filePath: string): void {
    // Invalidate client component cache
    if (this.clientComponentCache.has(filePath)) {
      this.clientComponentCache.delete(filePath);
      cacheLogger.debug(`Invalidated: client component ${filePath}`);
    }

    // Invalidate CSS module cache
    if (this.cssModuleCache.has(filePath)) {
      this.cssModuleCache.delete(filePath);
      cacheLogger.debug(`Invalidated: CSS module ${filePath}`);
    }

    // Invalidate the scan of every routes directory that holds the file
    for (const routesDir of this.routeScans.keys()) {
      if (buildValidator.isWithinOutputDir(filePath, routesDir)) {
        this.routeScans.delete(routesDir);
        cacheLogger.debug(`Invalidated: route scan of ${routesDir}`);
      }
    }
  }

  /**
   * Invalidate all caches for a list of changed files
   */
  invalidateFiles(filePaths: string[]): void {
    for (const filePath of filePaths) {
      this.invalidateFile(filePath);
    }
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.clientComponentCache.clear();
    this.cssModuleCache.clear();
    this.routeScans.clear();
    cacheLogger.debug("All caches cleared");
  }

  /**
   * Get cache statistics for debugging
   */
  getStats(): {
    clientComponents: number;
    cssModules: number;
    hasRoutes: boolean;
  } {
    return {
      clientComponents: this.clientComponentCache.size,
      cssModules: this.cssModuleCache.size,
      hasRoutes: this.routeScans.size > 0,
    };
  }
}

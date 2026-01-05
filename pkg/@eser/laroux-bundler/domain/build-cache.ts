// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Build Cache for Incremental Builds
 * Provides mtime-based caching for expensive build operations
 */

import * as logging from "@eser/logging";
import { invalidateRouteCache } from "./route-scanner.ts";

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
 * Cached route scan result
 */
export type RouteCacheEntry = {
  routes: unknown[];
  apiRoutes: unknown[];
  proxies: unknown[];
  mtime: number;
};

/**
 * Build Cache Manager
 * Maintains caches across incremental builds in watch mode
 */
export class BuildCache {
  private clientComponentCache: Map<string, ClientComponentCacheEntry> =
    new Map();
  private cssModuleCache: Map<string, CSSModuleCacheEntry> = new Map();
  private routeCache: RouteCacheEntry | null = null;

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
   * Get cached route scan result
   * @param currentMtime - Current routes directory modification time
   * @returns Cached entry if valid, null if cache miss or stale
   */
  getRouteCache(currentMtime: number): RouteCacheEntry | null {
    if (this.routeCache && this.routeCache.mtime >= currentMtime) {
      cacheLogger.debug("Cache hit: route scan");
      return this.routeCache;
    }
    return null;
  }

  /**
   * Set route scan result in cache
   */
  setRouteCache(
    routes: unknown[],
    apiRoutes: unknown[],
    proxies: unknown[],
    mtime: number,
  ): void {
    this.routeCache = { routes, apiRoutes, proxies, mtime };
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

    // Invalidate route cache if file is in routes directory
    if (filePath.includes("/routes/") || filePath.includes("\\routes\\")) {
      this.routeCache = null;
      invalidateRouteCache(); // Also invalidate the module-level route scanner cache
      cacheLogger.debug("Invalidated: route cache");
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
    this.routeCache = null;
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
      hasRoutes: this.routeCache !== null,
    };
  }
}

/**
 * Global build cache instance for watch mode
 * Created once and reused across incremental builds
 */
let globalCache: BuildCache | null = null;

/**
 * Get or create the global build cache
 */
export function getGlobalBuildCache(): BuildCache {
  if (!globalCache) {
    globalCache = new BuildCache();
    cacheLogger.debug("Created global build cache");
  }
  return globalCache;
}

/**
 * Reset the global build cache
 * Call this when starting a fresh build session
 */
export function resetGlobalBuildCache(): void {
  if (globalCache) {
    globalCache.clear();
  }
  globalCache = null;
  cacheLogger.debug("Reset global build cache");
}

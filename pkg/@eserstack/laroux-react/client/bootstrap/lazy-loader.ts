// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Lazy Chunk Loader
 * Dynamically loads code-split chunks on-demand
 */

import * as logging from "@eserstack/logging";
import type { ChunkManifest } from "@eserstack/laroux";
import type { LarouxGlobalThis } from "./globals.d.ts";

// The page-wide state the laroux client keeps on globalThis, with its types.
const larouxGlobals = globalThis as LarouxGlobalThis;

// How many names an error message lists before it counts the rest.
const LISTED_NAMES_LIMIT = 10;

const listNames = (names: readonly string[]): string => {
  if (names.length === 0) {
    return "none";
  }

  const listed = names.slice(0, LISTED_NAMES_LIMIT).join(", ");
  const rest = names.length - LISTED_NAMES_LIMIT;

  return rest > 0 ? `${listed} and ${rest} more` : listed;
};

/**
 * Lazy chunk loader with on-demand dynamic imports
 */
export class LazyChunkLoader {
  private manifest: ChunkManifest;
  private loadedChunks = new Set<string>();
  private loadingChunks = new Map<string, Promise<unknown>>();
  private moduleCache = new Map<string, unknown>();
  // Global registry of all loaded chunk modules for cross-chunk export search
  private loadedModules: unknown[] = [];

  /**
   * Creates a loader for the chunks of one build.
   *
   * @param manifest - The chunk manifest of the build to load from
   */
  constructor(manifest: ChunkManifest) {
    this.manifest = manifest;
  }

  /**
   * Load a module by ES Module path and export name
   * @param id - ES Module specifier (e.g., "./src/app/counter.tsx")
   * @param name - Export name (e.g., "default")
   * Returns the requested export from the component
   */
  async loadModule(id: string, name: string): Promise<unknown> {
    // Check if already cached
    const cacheKey = `${id}#${name}`;
    if (this.moduleCache.has(cacheKey)) {
      return this.moduleCache.get(cacheKey);
    }

    // Get component info from manifest
    // Normalize the id to match manifest keys (remove leading ./)
    const normalizedId = id.startsWith("./") ? id.slice(2) : id;
    const componentInfo = this.manifest.chunks[normalizedId];

    if (componentInfo === undefined) {
      const known = listNames(Object.keys(this.manifest.chunks));
      throw new Error(
        `load component ${id}: "${normalizedId}" is not in the chunk manifest; keys are case-sensitive paths (known: ${known})`,
      );
    }

    let module: unknown;
    let exportName: string;
    let allModules: unknown[] = [];

    // Check if this is runtime mode (has 'path') or production mode (has 'main')
    if ("path" in componentInfo) {
      // Runtime/HMR mode: components are in global registry
      // Components are registered in globalThis.__RUNTIME_MODULES__
      const runtimeModules = larouxGlobals.__RUNTIME_MODULES__;
      if (runtimeModules === undefined) {
        throw new Error(
          `Runtime modules registry not found. Expected globalThis.__RUNTIME_MODULES__ to be defined.`,
        );
      }

      module = runtimeModules[id];
      if (module === undefined) {
        const known = listNames(Object.keys(runtimeModules));
        throw new Error(
          `load component ${id}: not in the runtime module registry (known: ${known})`,
        );
      }

      exportName = name; // Use the requested export name
      allModules = [module]; // Only the runtime module
    } else {
      // Production mode: code-split chunks with main + deps
      // Helper to convert hash/path to full chunk path
      // If it's a path (contains /), use it directly with .js extension
      // If it's a hash, add chunk- prefix
      const chunkPath = (hashOrPath: string) =>
        hashOrPath.includes("/")
          ? `/${hashOrPath}.js`
          : `/chunk-${hashOrPath}.js`;

      // Load dependencies first (in parallel) and collect them
      const depModules = await Promise.all(
        componentInfo.deps.map((hash) => this.loadChunk(chunkPath(hash))),
      );

      // Load main chunk
      module = await this.loadChunk(chunkPath(componentInfo.main));

      // Use the export name from the RSC stream (authoritative), falling back to manifest
      exportName = name ?? componentInfo.exportName ?? "default";

      // All modules to search for the export (main + deps)
      allModules = [module, ...depModules];
    }

    // Helper function to find export in a module (including namespace objects)
    // oxlint-disable-next-line typescript/no-explicit-any
    const findExportInModule = (mod: Record<string, any>): unknown => {
      // Direct export
      if (mod[exportName]) {
        return mod[exportName];
      }

      // Search for a namespace object that contains the export
      // This handles minified chunks where exports are wrapped in namespace objects
      const moduleKeys = Object.keys(mod);
      for (const key of moduleKeys) {
        const value = mod[key];
        if (
          value !== null &&
          typeof value === "object" &&
          exportName in value
        ) {
          return value[exportName];
        }
      }
      return null;
    };

    // Search all modules for the export (main chunk first, then deps)
    let exported: unknown = null;
    for (const mod of allModules) {
      exported = findExportInModule(mod as Record<string, unknown>);
      if (exported) break;
    }

    // If not found in expected chunks, load and search ALL chunks from manifest
    // This handles cases where bundler's entrypointManifest is incorrect
    if (!exported) {
      // Get all chunk files from manifest
      const allChunkFiles = Object.keys(this.manifest.files).filter(
        (f) => f.startsWith("chunk-") && f.endsWith(".js"),
      );

      // Load all chunks that haven't been loaded yet
      const unloadedChunks = allChunkFiles.filter(
        (f) => !this.loadedChunks.has(`/${f}`),
      );

      if (unloadedChunks.length > 0) {
        await Promise.all(unloadedChunks.map((f) => this.loadChunk(`/${f}`)));
      }

      // Now search all loaded modules
      for (const mod of this.loadedModules) {
        if (allModules.includes(mod)) continue; // Already searched
        exported = findExportInModule(mod as Record<string, unknown>);
        if (exported) {
          break;
        }
      }
    }

    if (!exported) {
      const mainExports = listNames(
        Object.keys(module as Record<string, unknown>),
      );
      throw new Error(
        `load component ${id}: export "${exportName}" not found in ${allModules.length} expected and ${this.loadedModules.length} loaded chunks (exports of the main chunk: ${mainExports})`,
      );
    }

    // Cache the result
    this.moduleCache.set(cacheKey, exported);

    return exported;
  }

  /**
   * Load a single chunk file (with deduplication)
   * @param path - Full path to the chunk (e.g., "/chunk-MARX6EW4.js")
   * Returns the loaded module
   */
  private async loadChunk(path: string): Promise<unknown> {
    // Return if already loaded
    if (this.loadedChunks.has(path)) {
      // Re-import to get the module (it's cached by the browser)
      return await import(path);
    }

    // If currently loading, wait for that promise
    if (this.loadingChunks.has(path)) {
      return await this.loadingChunks.get(path);
    }

    // Start loading
    const loadPromise = import(path);
    this.loadingChunks.set(path, loadPromise);

    try {
      const module = await loadPromise;
      this.loadedChunks.add(path);
      this.loadingChunks.delete(path);
      // Register module in global registry for cross-chunk search
      if (!this.loadedModules.includes(module)) {
        this.loadedModules.push(module);
      }
      return module;
    } catch (error) {
      this.loadingChunks.delete(path);
      throw new Error(
        `load chunk ${path}: check that the file exists on the server`,
        { cause: error },
      );
    }
  }

  /**
   * Preload a component (for optimization)
   * @param id - ES Module specifier (e.g., "src/app/counter.tsx")
   */
  async preloadComponent(id: string): Promise<void> {
    const normalizedId = id.startsWith("./") ? id.slice(2) : id;
    const componentInfo = this.manifest.chunks[normalizedId];

    if (componentInfo === undefined) {
      return;
    }

    try {
      // Check if this is runtime mode (has 'path') or production mode (has 'main')
      if ("path" in componentInfo) {
        // Runtime/HMR mode: all components are already loaded in the runtime bundle
        return;
      } else {
        // Production mode: preload dependencies and main chunk in parallel
        const chunkPath = (hashOrPath: string) =>
          hashOrPath.includes("/")
            ? `/${hashOrPath}.js`
            : `/chunk-${hashOrPath}.js`;
        await Promise.all([
          ...componentInfo.deps.map((hash) => this.loadChunk(chunkPath(hash))),
          this.loadChunk(chunkPath(componentInfo.main)),
        ]);
      }
    } catch (error) {
      // Handled here: preloading only saves time, and loadModule loads the
      // chunks again when the component renders.
      await logging.logger
        .getLogger(["laroux-bundler", "loader"])
        .with({
          error,
        })
        .warn(`preload component ${id}; it loads when it renders instead`);
    }
  }

  /**
   * Get loading statistics (for debugging)
   */
  getStats(): {
    totalChunks: number;
    loadedChunks: number;
    loadingChunks: number;
    cachedModules: number;
  } {
    return {
      totalChunks: Object.keys(this.manifest.files).length,
      loadedChunks: this.loadedChunks.size,
      loadingChunks: this.loadingChunks.size,
      cachedModules: this.moduleCache.size,
    };
  }

  /**
   * Clear module cache (for hot reload scenarios)
   */
  clearCache(): void {
    this.moduleCache.clear();
  }
}

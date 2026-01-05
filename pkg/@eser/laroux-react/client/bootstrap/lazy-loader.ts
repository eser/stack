// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Lazy Chunk Loader
 * Dynamically loads code-split chunks on-demand
 */

/// <reference path="./globals.d.ts" />
import type { ChunkManifest } from "@eser/laroux-bundler";

// Build-time define - bundler replaces process.env.DEBUG with "false" at build time
// All if(DEBUG) blocks are tree-shaken in production builds
// deno-lint-ignore no-explicit-any
const DEBUG = (globalThis as any).process?.env?.DEBUG === "true";

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

  constructor(manifest: ChunkManifest) {
    this.manifest = manifest;
    if (DEBUG) {
      console.log("[LAZY] Initialized with manifest:", manifest);
      console.log(
        `[LAZY] ${Object.keys(manifest.chunks).length} components available`,
      );
    }
  }

  /**
   * Load a module by ES Module path and export name
   * @param id - ES Module specifier (e.g., "./src/app/counter.tsx")
   * @param name - Export name (e.g., "default")
   * Returns the requested export from the component
   */
  async loadModule(id: string, name: string): Promise<unknown> {
    if (DEBUG) console.log(`[LAZY] Request: ${id}#${name}`);

    // Check if already cached
    const cacheKey = `${id}#${name}`;
    if (this.moduleCache.has(cacheKey)) {
      if (DEBUG) console.log(`[LAZY] Cache hit: ${cacheKey}`);
      return this.moduleCache.get(cacheKey);
    }

    try {
      // Get component info from manifest
      // Normalize the id to match manifest keys (remove leading ./)
      const normalizedId = id.startsWith("./") ? id.slice(2) : id;
      const componentInfo = this.manifest.chunks[normalizedId];

      if (!componentInfo) {
        console.error(
          `[LAZY] ❌ Component not found in manifest: ${normalizedId}`,
        );
        console.error(
          `[LAZY] 📝 Original ID: ${id}`,
        );
        console.error(
          `[LAZY] 📝 Normalized ID: ${normalizedId}`,
        );
        console.error(
          `[LAZY] 📦 Available components (${
            Object.keys(this.manifest.chunks).length
          }):`,
        );
        Object.keys(this.manifest.chunks).forEach((key) => {
          console.error(`  - ${key}`);
        });
        console.error(
          `[LAZY] 💡 Tip: Check that the component path matches exactly (case-sensitive)`,
        );
        throw new Error(
          `Component not found in chunk manifest: ${normalizedId}. ` +
            `Available: ${
              Object.keys(this.manifest.chunks).slice(0, 5).join(", ")
            }...`,
        );
      }

      let module: unknown;
      let exportName: string;
      let allModules: unknown[] = [];

      // Check if this is runtime mode (has 'path') or production mode (has 'main')
      if ("path" in componentInfo) {
        // Runtime/HMR mode: components are in global registry
        if (DEBUG) {
          console.log(`[LAZY] Runtime mode: loading from global registry`);
        }

        // Components are registered in globalThis.__RUNTIME_MODULES__
        const runtimeModules = globalThis.__RUNTIME_MODULES__;
        if (!runtimeModules) {
          throw new Error(
            `Runtime modules registry not found. Expected globalThis.__RUNTIME_MODULES__ to be defined.`,
          );
        }

        module = runtimeModules[id];
        if (!module) {
          console.error(`[LAZY] Component not in runtime registry: ${id}`);
          console.error(
            `[LAZY] Available modules:`,
            Object.keys(runtimeModules),
          );
          throw new Error(`Component not found in runtime registry: ${id}`);
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

        if (DEBUG) {
          console.log(
            `[LAZY] Component: main=${componentInfo.main}, deps=[${
              componentInfo.deps.join(", ")
            }]`,
          );
        }

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
      // deno-lint-ignore no-explicit-any
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
            value !== null && typeof value === "object" && exportName in value
          ) {
            if (DEBUG) {
              console.log(
                `[LAZY] Found export "${exportName}" in namespace "${key}"`,
              );
            }
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
        if (DEBUG) {
          console.log(
            `[LAZY] Export not in expected chunks, loading all manifest chunks...`,
          );
        }

        // Get all chunk files from manifest
        const allChunkFiles = Object.keys(this.manifest.files)
          .filter((f) => f.startsWith("chunk-") && f.endsWith(".js"));

        // Load all chunks that haven't been loaded yet
        const unloadedChunks = allChunkFiles.filter(
          (f) => !this.loadedChunks.has(`/${f}`),
        );

        if (unloadedChunks.length > 0) {
          if (DEBUG) {
            console.log(
              `[LAZY] Loading ${unloadedChunks.length} additional chunks...`,
            );
          }
          await Promise.all(
            unloadedChunks.map((f) => this.loadChunk(`/${f}`)),
          );
        }

        // Now search all loaded modules
        for (const mod of this.loadedModules) {
          if (allModules.includes(mod)) continue; // Already searched
          exported = findExportInModule(mod as Record<string, unknown>);
          if (exported) {
            if (DEBUG) {
              console.log(`[LAZY] Found "${exportName}" in another chunk`);
            }
            break;
          }
        }
      }

      if (!exported) {
        console.error(`[LAZY] Export "${exportName}" not found in module`);
        console.error(`[LAZY] Available exports:`, Object.keys(module));
        console.error(
          `[LAZY] Searched ${allModules.length} expected + ${this.loadedModules.length} total loaded chunks`,
        );
        throw new Error(`Export "${exportName}" not found in ${id}`);
      }

      // Cache the result
      this.moduleCache.set(cacheKey, exported);

      if (DEBUG) console.log(`[LAZY] Successfully loaded: ${id}#${name}`);
      return exported;
    } catch (error) {
      console.error(`[LAZY] Failed to load ${id}#${name}:`, error);
      throw error;
    }
  }

  /**
   * Load a single chunk file (with deduplication)
   * @param path - Full path to the chunk (e.g., "/chunk-MARX6EW4.js")
   * Returns the loaded module
   */
  private async loadChunk(path: string): Promise<unknown> {
    // Return if already loaded
    if (this.loadedChunks.has(path)) {
      if (DEBUG) console.log(`[LAZY] Chunk already loaded: ${path}`);
      // Re-import to get the module (it's cached by the browser)
      return await import(path);
    }

    // If currently loading, wait for that promise
    if (this.loadingChunks.has(path)) {
      if (DEBUG) console.log(`[LAZY] Waiting for chunk: ${path}`);
      return await this.loadingChunks.get(path);
    }

    // Start loading
    if (DEBUG) console.log(`[LAZY] Loading chunk: ${path}`);
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
      if (DEBUG) console.log(`[LAZY] Chunk loaded: ${path}`);
      return module;
    } catch (error) {
      this.loadingChunks.delete(path);
      console.error(`[LAZY] ❌ Failed to load chunk: ${path}`);
      console.error(
        `[LAZY] 💡 Tip: Verify the chunk file exists on the server at: ${path}`,
      );
      console.error(`[LAZY] Original error:`, error);
      throw new Error(
        `Failed to load chunk ${path}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Preload a component (for optimization)
   * @param id - ES Module specifier (e.g., "src/app/counter.tsx")
   */
  async preloadComponent(id: string): Promise<void> {
    if (DEBUG) console.log(`[LAZY] Preloading: ${id}`);

    const normalizedId = id.startsWith("./") ? id.slice(2) : id;
    const componentInfo = this.manifest.chunks[normalizedId];

    if (!componentInfo) {
      if (DEBUG) {
        console.log(`[LAZY] Component not in manifest: ${normalizedId}`);
      }
      return;
    }

    try {
      // Check if this is runtime mode (has 'path') or production mode (has 'main')
      if ("path" in componentInfo) {
        // Runtime/HMR mode: all components are already loaded in the runtime bundle
        if (DEBUG) console.log(`[LAZY] Preload skipped (runtime mode): ${id}`);
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
        if (DEBUG) console.log(`[LAZY] Preloaded: ${id}`);
      }
    } catch (error) {
      console.error(`[LAZY] Failed to preload ${id}:`, error);
    }
  }

  /**
   * Get loading statistics (for debugging)
   */
  getStats() {
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
    if (DEBUG) console.log("[LAZY] Module cache cleared");
  }
}

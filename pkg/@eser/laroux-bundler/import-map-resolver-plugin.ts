// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Import Map Resolver Plugin for Bundlers
 *
 * A general-purpose resolver that uses the project's import map (from deno.json
 * and/or package.json) to resolve bare specifiers and handle externals.
 *
 * This replaces the narrow JSR resolver plugin with a comprehensive solution that:
 * 1. Reads both deno.json and package.json import maps
 * 2. Resolves ALL bare imports (not just @eser/*)
 * 3. Properly marks external packages (npm/jsr)
 * 4. Provides browser shims for server-only packages
 *
 * Works with both deno-bundler and rolldown backends.
 *
 * @module
 */

import type { BundlerPlugin } from "@eser/bundler/backends";
import { tryLoad as tryLoadPackage } from "@eser/codebase/package";
import * as logging from "@eser/logging";
import { runtime } from "@eser/standards/runtime";
import {
  type ImportMap,
  isBareSpecifier,
  isExternal,
  isPathSpecifier,
  loadImportMap,
  resolveSpecifier,
} from "./domain/import-map.ts";
import type { ResolvedBrowserShimsConfig } from "./types.ts";

/**
 * Resolve npm package from Deno's .deno directory structure.
 * Fallback for transitive dependencies not symlinked to top-level node_modules.
 * Returns null if not running in Deno or package not found.
 */
async function resolveFromDenoModules(
  specifier: string,
  projectRoot: string,
): Promise<string | null> {
  const denoDir = runtime.path.join(projectRoot, "node_modules", ".deno");

  try {
    // Check if .deno directory exists (indicates Deno environment)
    const stat = await runtime.fs.stat(denoDir).catch(() => null);
    if (!stat?.isDirectory) {
      return null;
    }

    // Extract package name (handle scoped packages like @scope/pkg)
    const parts = specifier.split("/");
    const packageName = specifier.startsWith("@")
      ? parts.slice(0, 2).join("/")
      : parts[0] ?? specifier;
    const subpath = specifier.startsWith("@")
      ? parts.slice(2).join("/")
      : parts.slice(1).join("/");

    // Scan .deno for matching package directory
    for await (const entry of runtime.fs.readDir(denoDir)) {
      if (entry.isDirectory && entry.name.startsWith(`${packageName}@`)) {
        const pkgDir = runtime.path.join(
          denoDir,
          entry.name,
          "node_modules",
          packageName,
        );

        // Check if this package directory exists
        const pkgStat = await runtime.fs.stat(pkgDir).catch(() => null);
        if (!pkgStat?.isDirectory) continue;

        // If there's a subpath, resolve it directly
        if (subpath) {
          const subpathFile = runtime.path.join(pkgDir, subpath);
          const subpathStat = await runtime.fs.stat(subpathFile).catch(
            () => null,
          );
          if (subpathStat) {
            return subpathFile;
          }
          // Try with .js extension
          const subpathJs = `${subpathFile}.js`;
          const subpathJsStat = await runtime.fs.stat(subpathJs).catch(
            () => null,
          );
          if (subpathJsStat) {
            return subpathJs;
          }
          continue;
        }

        // Load package config using @eser/codebase (handles deno.json, jsr.json, package.json)
        const pkgConfig = await tryLoadPackage({ baseDir: pkgDir });

        if (pkgConfig !== undefined) {
          let mainEntry: string | undefined;

          // 1. Check exports field first (modern standard across all config types)
          if (pkgConfig.exports !== undefined) {
            const exportsValue = pkgConfig.exports.value;
            if (typeof exportsValue === "string") {
              mainEntry = exportsValue;
            } else if (
              typeof exportsValue === "object" &&
              exportsValue["."] !== undefined
            ) {
              const dotExport = exportsValue["."];
              // Handle conditional exports: { ".": { "import": "./index.mjs" } }
              if (typeof dotExport === "string") {
                mainEntry = dotExport;
              } else if (typeof dotExport === "object") {
                const conditional = dotExport as Record<string, string>;
                mainEntry = conditional.import ?? conditional.module ??
                  conditional.default ?? conditional.require;
              }
            }
          }

          // 2. Fallback to module/main from raw config content (any loaded file)
          if (mainEntry === undefined) {
            for (const loadedFile of pkgConfig._loadedFiles) {
              const rawContent = loadedFile.content as Record<string, unknown>;
              const moduleField = rawContent.module as string | undefined;
              const mainField = rawContent.main as string | undefined;
              mainEntry = moduleField ?? mainField;
              if (mainEntry !== undefined) break;
            }
          }

          // 3. Default to index.js
          mainEntry ??= "index.js";

          return runtime.path.join(pkgDir, mainEntry);
        }

        // Final fallback: try index.js directly
        const indexPath = runtime.path.join(pkgDir, "index.js");
        const indexStat = await runtime.fs.stat(indexPath).catch(() => null);
        if (indexStat) {
          return indexPath;
        }
      }
    }
  } catch {
    // Not in Deno environment or other error - silently fail
  }

  return null;
}

const resolverLogger = logging.logger.getLogger([
  "laroux-bundler",
  "import-map-resolver",
]);

export type ImportMapResolverOptions = {
  /** Project root directory */
  projectRoot: string;
  /** Browser shims configuration for server-only packages */
  browserShims: ResolvedBrowserShimsConfig;
  /** Pre-loaded import map (optional, will be loaded if not provided) */
  importMap?: ImportMap;
  /** Cache for resolved paths */
  cache?: Map<string, string>;
  /**
   * Automatically mark npm/jsr packages as external (default: true).
   * Set to false for server bundling where externals are specified explicitly.
   * See ADR: 0002-bundler-external-import-specifiers.md
   */
  autoMarkExternal?: boolean;
  /**
   * Explicit list of external packages (supports prefix matching).
   * e.g., ["@eser/laroux-server"] matches "@eser/laroux-server/action-registry"
   */
  externals?: string[];
};

/**
 * Create an import map resolver plugin for the bundler.
 *
 * This plugin:
 * 1. Intercepts ALL bare specifier imports
 * 2. Resolves them using the project's import map
 * 3. For local packages: returns the resolved file path
 * 4. For external packages (npm/jsr): marks them as external
 * 5. For packages with browser shims: returns the shim content
 */
export function createImportMapResolverPlugin(
  options: ImportMapResolverOptions,
): BundlerPlugin {
  const cache = options.cache ?? new Map<string, string>();
  let importMap: ImportMap | null = options.importMap ?? null;
  const autoMarkExternal = options.autoMarkExternal ?? true;
  const externals = options.externals ?? [];

  // Check if specifier matches any explicit external (supports prefix matching)
  const isExplicitExternal = (specifier: string): boolean => {
    for (const pkg of externals) {
      if (specifier === pkg || specifier.startsWith(`${pkg}/`)) {
        return true;
      }
    }
    return false;
  };

  // Merge jsr and nodeBuiltins shims into a single lookup map
  const browserShims: Record<string, string> = {
    ...options.browserShims.jsr,
    ...options.browserShims.nodeBuiltins,
  };

  return {
    name: "import-map-resolver",
    async setup(build) {
      // Load import map if not provided
      if (importMap === null) {
        importMap = await loadImportMap(options.projectRoot);
        resolverLogger.debug(
          `Loaded import map: ${importMap.entries.size} entries, ${importMap.externals.length} externals`,
        );
      }

      // Match ALL bare specifiers
      build.onResolve({ filter: /^[^./]/ }, async (args) => {
        const specifier = args.path;

        // Skip if not a bare specifier
        if (!isBareSpecifier(specifier)) {
          return {};
        }

        // Check cache first
        const cached = cache.get(specifier);
        if (cached !== undefined) {
          if (cached === "external") {
            return { external: true };
          }
          return { path: cached };
        }

        // Check explicit externals first (supports prefix matching)
        // See ADR: 0002-bundler-external-import-specifiers.md
        if (isExplicitExternal(specifier)) {
          cache.set(specifier, "external");
          resolverLogger.debug(`Marking ${specifier} as external (explicit)`);
          return { external: true };
        }

        // Check if we have a browser shim for this specifier
        if (browserShims[specifier] !== undefined) {
          resolverLogger.debug(`Using browser shim for ${specifier}`);
          return { path: `\0virtual:${specifier}`, namespace: "browser-shim" };
        }

        // Try to resolve using import map
        const resolved = resolveSpecifier(specifier, importMap!);

        if (resolved !== null) {
          // Check if it's an external package (only if autoMarkExternal is enabled)
          // For server bundling, autoMarkExternal=false and externals are specified explicitly
          // See ADR: 0002-bundler-external-import-specifiers.md
          if (autoMarkExternal && isExternal(specifier, importMap!)) {
            cache.set(specifier, "external");
            resolverLogger.debug(`Marking ${specifier} as external`);
            // Keep bare specifier - do NOT rewrite to jsr:/npm: as those break Node.js/Bun
            return { external: true };
          }

          // Try to resolve to a local file
          try {
            // Handle relative paths - resolve from project root, not from plugin file
            if (isPathSpecifier(resolved)) {
              const filePath = runtime.path.resolve(
                importMap!.projectRoot,
                resolved,
              );
              cache.set(specifier, filePath);
              resolverLogger.debug(`Resolved ${specifier} → ${filePath}`);
              return { path: filePath };
            }

            // Use import.meta.resolve for non-relative paths
            const resolvedUrl = import.meta.resolve(resolved);

            if (resolvedUrl.startsWith("file://")) {
              const filePath = new URL(resolvedUrl).pathname;
              cache.set(specifier, filePath);
              resolverLogger.debug(`Resolved ${specifier} → ${filePath}`);
              return { path: filePath };
            }

            // Remote URL (npm:, jsr:, https:) - mark as external only if autoMarkExternal is enabled
            // For browser bundles (autoMarkExternal: false), let bundler handle npm resolution from node_modules
            if (autoMarkExternal) {
              cache.set(specifier, "external");
              resolverLogger.debug(
                `Marking ${specifier} as external (remote: ${resolvedUrl})`,
              );
              return { external: true };
            }

            // For browser bundles, return empty to let bundler's default npm resolution handle it
            // Rolldown will resolve npm packages from node_modules just like deno-bundler does
            resolverLogger.debug(
              `Letting bundler resolve ${specifier} from node_modules`,
            );
            return {};
          } catch (error) {
            resolverLogger.debug(
              `Failed to resolve ${resolved}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            // Fall through to let other resolvers handle it
          }
        }

        // Not in import map - check if it looks like an npm package
        // and should be marked as external (only if autoMarkExternal is enabled)
        if (autoMarkExternal && isBareSpecifier(specifier)) {
          cache.set(specifier, "external");
          resolverLogger.debug(
            `Marking ${specifier} as external (bare import not in import map)`,
          );
          return { external: true };
        }

        // For browser bundles, try to resolve from Deno's .deno directory as fallback
        // This handles transitive npm dependencies that aren't symlinked to top-level
        if (!autoMarkExternal && isBareSpecifier(specifier)) {
          const resolved = await resolveFromDenoModules(
            specifier,
            options.projectRoot,
          );
          if (resolved !== null) {
            cache.set(specifier, resolved);
            resolverLogger.debug(
              `Resolved npm transitive dependency ${specifier} → ${resolved}`,
            );
            return { path: resolved };
          }
        }

        // Let other resolvers or bundler's default resolution handle it
        return {};
      });

      // Match explicit jsr: specifiers
      build.onResolve({ filter: /^jsr:/ }, (args) => {
        const specifier = args.path;

        const cached = cache.get(specifier);
        if (cached !== undefined) {
          if (cached === "external") {
            return { external: true };
          }
          return { path: cached };
        }

        try {
          const resolvedUrl = import.meta.resolve(specifier);

          if (resolvedUrl.startsWith("file://")) {
            const filePath = new URL(resolvedUrl).pathname;
            cache.set(specifier, filePath);
            resolverLogger.debug(`Resolved ${specifier} → ${filePath}`);
            return { path: filePath };
          }

          // Remote JSR package - mark as external
          cache.set(specifier, "external");
          resolverLogger.debug(`Marking ${specifier} as external (remote JSR)`);
          return { external: true };
        } catch (error) {
          resolverLogger.debug(
            `Failed to resolve ${specifier}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return {};
        }
      });

      // Match node: protocol imports (for browser shimming)
      build.onResolve({ filter: /^node:/ }, (args) => {
        const specifier = args.path;

        if (browserShims[specifier] !== undefined) {
          resolverLogger.debug(`Using browser shim for ${specifier}`);
          return { path: `\0virtual:${specifier}`, namespace: "browser-shim" };
        }

        // No shim available - mark as external
        resolverLogger.warn(
          `Node builtin ${specifier} has no browser shim - marking as external`,
        );
        return { external: true };
      });

      // Load virtual shim modules
      build.onLoad({ filter: /.*/, namespace: "browser-shim" }, (args) => {
        const specifier = args.path.replace("\0virtual:", "");
        const contents = browserShims[specifier];
        if (contents !== undefined) {
          return { contents, loader: "js" };
        }
        return {};
      });
    },
  };
}

/**
 * Create a resolver plugin with a pre-loaded import map.
 * Use this when you want to share the import map across multiple build steps.
 */
export async function createImportMapResolverPluginAsync(
  options: Omit<ImportMapResolverOptions, "importMap">,
): Promise<{ plugin: BundlerPlugin; importMap: ImportMap }> {
  const importMap = await loadImportMap(options.projectRoot);

  const plugin = createImportMapResolverPlugin({
    ...options,
    importMap,
  });

  return { plugin, importMap };
}

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
      build.onResolve({ filter: /^[^./]/ }, (args) => {
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

        // For browser bundles, try to resolve npm transitive dependencies
        // Deno's nodeModulesDir doesn't symlink transitive deps to top-level
        // Use import.meta.resolve to find the package in Deno's .deno directory
        if (!autoMarkExternal && isBareSpecifier(specifier)) {
          try {
            const npmSpecifier = `npm:${specifier}`;
            const resolvedUrl = import.meta.resolve(npmSpecifier);
            if (resolvedUrl.startsWith("file://")) {
              const filePath = new URL(resolvedUrl).pathname;
              cache.set(specifier, filePath);
              resolverLogger.debug(
                `Resolved transitive npm dependency ${specifier} → ${filePath}`,
              );
              return { path: filePath };
            }
          } catch {
            // Package not found via npm - let bundler handle it
            resolverLogger.debug(
              `Could not resolve ${specifier} as npm package, falling through`,
            );
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

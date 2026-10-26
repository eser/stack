// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Import Map Resolver Plugin for Bundlers
 *
 * Decides what happens to the bare imports of a bundle:
 * 1. Packages with a browser shim are replaced by the shim
 * 2. Explicit externals stay external, keeping their bare specifier
 * 3. With autoMarkExternal, every other bare import stays external too
 * 4. Otherwise rolldown resolves the import from the importing file through
 *    node_modules, so an app's dependencies resolve from the app, in pnpm's
 *    isolated layout as well
 *
 * Bare specifiers are never rewritten (ADR 0004). Runs as a Rolldown plugin.
 *
 * @module
 */

import type { BundlerPlugin } from "@eserstack/bundler/backends";
import * as logging from "@eserstack/logging";
import * as importMap from "./domain/import-map.ts";
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
  /** Cache of the externals decided so far, keyed by specifier */
  cache?: Map<string, string>;
  /**
   * Keep every bare import external (default: true). Set it to false for
   * browser bundles, which inline their packages from node_modules.
   * See ADR 0004 (bundler external import specifiers).
   */
  autoMarkExternal?: boolean;
  /**
   * Explicit list of external packages (supports prefix matching).
   * e.g., ["@eserstack/laroux-server"] matches "@eserstack/laroux-server/action-registry"
   */
  externals?: string[];
};

/** The cache value that marks a specifier as external. */
const EXTERNAL = "external";

/**
 * Create an import map resolver plugin for the bundler.
 *
 * This plugin:
 * 1. Intercepts every bare specifier and node: import
 * 2. Returns the browser shim of a package that has one
 * 3. Marks explicit externals, and with autoMarkExternal every bare import,
 *    as external without rewriting the specifier
 * 4. Leaves every other bare import to rolldown's node_modules resolution
 */
export function createImportMapResolverPlugin(
  options: ImportMapResolverOptions,
): BundlerPlugin {
  const cache = options.cache ?? new Map<string, string>();
  const autoMarkExternal = options.autoMarkExternal ?? true;
  const externals = options.externals ?? [];

  // Check if specifier matches any explicit external (supports prefix matching)
  const isExplicitExternal = (specifier: string): boolean => {
    for (const external of externals) {
      if (specifier === external || specifier.startsWith(`${external}/`)) {
        return true;
      }
    }
    return false;
  };

  // Merge the package and node builtin shims into a single lookup map
  const browserShims: Record<string, string> = {
    ...options.browserShims.jsr,
    ...options.browserShims.nodeBuiltins,
  };

  return {
    name: "import-map-resolver",
    setup(build) {
      // Match ALL bare specifiers
      build.onResolve({ filter: /^[^./]/ }, (args) => {
        const specifier = args.path;

        // Skip if not a bare specifier
        if (!importMap.isBareSpecifier(specifier)) {
          return {};
        }

        if (cache.get(specifier) === EXTERNAL) {
          return { external: true };
        }

        // Check explicit externals first (supports prefix matching)
        if (isExplicitExternal(specifier)) {
          cache.set(specifier, EXTERNAL);
          resolverLogger.debug(`Marking ${specifier} as external (explicit)`);
          return { external: true };
        }

        // Check if we have a browser shim for this specifier
        if (browserShims[specifier] !== undefined) {
          resolverLogger.debug(`Using browser shim for ${specifier}`);
          return { path: `\0virtual:${specifier}`, namespace: "browser-shim" };
        }

        if (autoMarkExternal) {
          cache.set(specifier, EXTERNAL);
          resolverLogger.debug(`Marking ${specifier} as external`);
          // Keep the bare specifier; it resolves from node_modules at run time
          return { external: true };
        }

        // Browser bundles inline the package: rolldown resolves it from the
        // importing file through node_modules
        return {};
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

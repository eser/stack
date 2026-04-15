// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Server Externals Plugin
 *
 * A minimal bundler plugin that marks specific packages as external for server bundling.
 * Unlike the full import-map-resolver, this plugin:
 * 1. ONLY intercepts packages in the externals list
 * 2. Lets rolldown's native resolution handle everything else
 *
 * This ensures npm packages like react, lucide-react, etc. are properly bundled
 * while @eserstack/laroux and @eserstack/laroux-server remain external (resolved from node_modules at runtime).
 *
 * @module
 */

import type { BundlerPlugin } from "@eserstack/bundler/backends";
import * as logging from "@eserstack/logging";

const pluginLogger = logging.logger.getLogger([
  "laroux-bundler",
  "server-externals",
]);

/**
 * Check if a specifier matches any of the external packages.
 * Supports both exact matches and subpath imports:
 * - "@eserstack/laroux-server" matches "@eserstack/laroux-server"
 * - "@eserstack/laroux-server" matches "@eserstack/laroux-server/action-registry"
 */
function isExternalPackage(specifier: string, externals: string[]): boolean {
  for (const pkg of externals) {
    if (specifier === pkg || specifier.startsWith(`${pkg}/`)) {
      return true;
    }
  }
  return false;
}

export type ServerExternalsPluginOptions = {
  /**
   * List of packages to mark as external.
   * Supports prefix matching for subpath imports.
   */
  externals: string[];
};

/**
 * Create a minimal server externals plugin.
 *
 * This plugin ONLY marks specified packages as external.
 * All other imports are passed through to rolldown's native resolution,
 * which will bundle them from node_modules.
 */
export function createServerExternalsPlugin(
  options: ServerExternalsPluginOptions,
): BundlerPlugin {
  const { externals } = options;

  // Build regex pattern for matching externals
  // e.g., ["@eserstack/laroux", "@eserstack/laroux-server"] -> /^(@eser\/laroux|@eser\/laroux-server)($|\/)/
  const escapedPackages = externals.map((pkg) =>
    pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  const pattern = new RegExp(`^(${escapedPackages.join("|")})($|\\/)`);

  pluginLogger.debug(
    `Server externals plugin initialized with ${externals.length} packages: ${
      externals.join(", ")
    }`,
  );

  return {
    name: "server-externals",
    setup(build) {
      // Only intercept packages that match our externals list
      build.onResolve({ filter: pattern }, (args) => {
        const specifier = args.path;

        if (isExternalPackage(specifier, externals)) {
          pluginLogger.debug(`Marking as external: ${specifier}`);
          return { external: true };
        }

        // This shouldn't happen due to the filter, but just in case
        return {};
      });
    },
  };
}

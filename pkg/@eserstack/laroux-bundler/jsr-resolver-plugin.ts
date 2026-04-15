// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * JSR Resolver Plugin for Rolldown
 * Resolves JSR imports (@eserstack/*, jsr:) to actual file paths for bundling
 * Provides browser shims for server-only packages
 */

import type { BundlerPlugin } from "@eserstack/bundler/backends";
import * as logging from "@eserstack/logging";
import type { ResolvedBrowserShimsConfig } from "./types.ts";

const resolverLogger = logging.logger.getLogger(["laroux", "jsr-resolver"]);

export type JsrResolverOptions = {
  /** Project root directory */
  projectRoot: string;
  /** Browser shims configuration */
  browserShims: ResolvedBrowserShimsConfig;
  /** Cache for resolved paths */
  cache?: Map<string, string>;
};

/**
 * Create a JSR resolver plugin for rolldown bundler.
 *
 * This plugin intercepts @eserstack/* and jsr: imports and resolves them
 * to actual file paths using Deno's import resolution.
 */
export function createJsrResolverPlugin(
  options: JsrResolverOptions,
): BundlerPlugin {
  const cache = options.cache ?? new Map<string, string>();

  // Merge jsr and nodeBuiltins shims into a single lookup map
  const browserShims: Record<string, string> = {
    ...options.browserShims.jsr,
    ...options.browserShims.nodeBuiltins,
  };

  return {
    name: "jsr-resolver",
    setup(build) {
      // Match @eserstack/* imports (bare specifiers mapped in deno.json)
      build.onResolve({ filter: /^@eser\// }, (args) => {
        const specifier = args.path;

        // Check cache first
        const cached = cache.get(specifier);
        if (cached !== undefined) {
          return { path: cached };
        }

        // Check if we have a browser shim for this package
        if (browserShims[specifier] !== undefined) {
          resolverLogger.debug(`Using browser shim for ${specifier}`);
          return { path: `\0virtual:${specifier}`, namespace: "jsr-shim" };
        }

        try {
          // Use Deno's import.meta.resolve to get the resolved URL
          const resolvedUrl = import.meta.resolve(specifier);

          // Only resolve file:// URLs (local workspace packages)
          // Remote JSR packages (https://) should stay external as they're TypeScript
          if (resolvedUrl.startsWith("file://")) {
            const filePath = new URL(resolvedUrl).pathname;
            cache.set(specifier, filePath);
            resolverLogger.debug(`Resolved ${specifier} → ${filePath}`);
            return { path: filePath };
          }

          // Remote JSR packages without shims: mark as external
          resolverLogger.debug(`Marking ${specifier} as external (remote JSR)`);
          return { external: true };
        } catch (error) {
          resolverLogger.debug(
            `Failed to resolve ${specifier}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return {}; // Let other resolvers handle it
        }
      });

      // Match node: protocol imports (for browser shimming)
      build.onResolve({ filter: /^node:/ }, (args) => {
        const specifier = args.path;

        // Check if we have a browser shim for this node builtin
        if (browserShims[specifier] !== undefined) {
          resolverLogger.debug(`Using browser shim for ${specifier}`);
          return { path: `\0virtual:${specifier}`, namespace: "jsr-shim" };
        }

        // No shim available - mark as external to prevent bundling failures
        // The browser will fail to load this, but at least bundling succeeds
        resolverLogger.warn(
          `Node builtin ${specifier} has no browser shim - marking as external`,
        );
        return { external: true };
      });

      // Load virtual shim modules
      build.onLoad({ filter: /.*/, namespace: "jsr-shim" }, (args) => {
        const specifier = args.path.replace("\0virtual:", "");
        const contents = browserShims[specifier];
        if (contents !== undefined) {
          return { contents, loader: "js" };
        }
        return {}; // Let other loaders handle it
      });

      // Match explicit jsr: specifiers
      build.onResolve({ filter: /^jsr:/ }, (args) => {
        const specifier = args.path;

        // Check cache first
        const cached = cache.get(specifier);
        if (cached !== undefined) {
          return { path: cached };
        }

        try {
          const resolvedUrl = import.meta.resolve(specifier);

          // Only resolve file:// URLs (local workspace packages)
          if (resolvedUrl.startsWith("file://")) {
            const filePath = new URL(resolvedUrl).pathname;
            cache.set(specifier, filePath);
            resolverLogger.debug(`Resolved ${specifier} → ${filePath}`);
            return { path: filePath };
          }

          // Remote JSR packages: mark as external
          resolverLogger.debug(`Marking ${specifier} as external (remote JSR)`);
          return { external: true };
        } catch (error) {
          resolverLogger.debug(
            `Failed to resolve ${specifier}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return {}; // Let other resolvers handle it
        }
      });
    },
  };
}

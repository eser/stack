// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Smart Refresh Module
 * Implements module-aware refresh without full page reload
 * Preserves scroll position and browser state
 */

/// <reference path="./globals.d.ts" />
import * as logging from "@eserstack/logging";

const smartRefreshLogger = logging.logger.getLogger([
  "laroux-bundler",
  "smart-refresh",
]);

/**
 * Check if a module path is a client component
 * Uses chunk manifest to identify bundled client components
 * Only client components require full page reload when changed
 */
function isClientComponent(modulePath: string): boolean {
  const manifest = globalThis.__CHUNK_MANIFEST__;
  if (!manifest?.chunks) return false;

  // Normalize path for comparison (remove leading ./ and normalize separators)
  const normalized = modulePath.replace(/^\.\//, "").replace(/\\/g, "/");

  // Check if this path exists in chunks (only client components are in chunks)
  return Object.keys(manifest.chunks).some((key) => {
    const normalizedKey = key.replace(/^\.\//, "").replace(/\\/g, "/");
    // Check for exact match or partial match (handle different path formats)
    return normalizedKey === normalized ||
      normalizedKey.endsWith(normalized) ||
      normalized.endsWith(normalizedKey);
  });
}

/**
 * Check if a module change requires full page reload
 * Returns true for client components and bundler infrastructure files
 */
function requiresFullReload(modulePath: string): boolean {
  // Always reload for bundler client code and runtime bundle
  if (
    modulePath.includes("packages/bundler/client/") ||
    modulePath.includes("packages/laroux-bundler/client/") ||
    modulePath.includes("/__runtime_bundle.js")
  ) {
    return true;
  }

  // Check if it's a client component
  return isClientComponent(modulePath);
}

/**
 * Initialize Smart Refresh runtime
 * Sets up the refresh mechanism for HMR updates
 */
export function initializeSmartRefresh(): void {
  if (typeof globalThis === "undefined") return;

  smartRefreshLogger.debug("Runtime initialized");

  // Track if we're in the middle of a refresh
  globalThis.__REFRESH_PENDING__ = false;

  // Track last changed modules for debugging
  globalThis.__LAST_CHANGED_MODULES__ = [];

  // Helper to perform a smart refresh with module awareness
  globalThis.__performSmartRefresh__ = async function (
    changedModules?: string[],
  ) {
    if (globalThis.__REFRESH_PENDING__) {
      smartRefreshLogger.debug("Refresh already pending, skipping");
      return;
    }

    globalThis.__REFRESH_PENDING__ = true;

    try {
      // Store changed modules for debugging
      globalThis.__LAST_CHANGED_MODULES__ = changedModules ?? [];

      if (changedModules && changedModules.length > 0) {
        smartRefreshLogger.debug("Modules changed:", { changedModules });
      } else {
        smartRefreshLogger.debug("Starting refresh (no module info)");
      }

      // Check if any changed modules are client components or bundler infrastructure
      // If so, we need a full page reload to get the updated JavaScript bundle
      const hasClientComponentChanges = changedModules?.some((module) =>
        requiresFullReload(module)
      );

      if (hasClientComponentChanges) {
        const matchedModules = changedModules?.filter((module) =>
          requiresFullReload(module)
        );
        smartRefreshLogger.debug(
          "Client component(s) changed, performing full page reload",
          { matchedModules },
        );
        globalThis.location.reload();
        return;
      }

      // Server component or non-client file changed - do smart refresh
      smartRefreshLogger.debug(
        "Server component(s) changed, performing smart refresh",
        { changedModules },
      );

      // Save scroll position to restore after refresh
      const scrollX = globalThis.scrollX;
      const scrollY = globalThis.scrollY;

      // Clear the RSC promise cache so it refetches
      if (globalThis.__clearRSCCache__) {
        globalThis.__clearRSCCache__(changedModules);
        smartRefreshLogger.debug("RSC cache cleared");
      }

      // Trigger a re-render by calling the refresh function
      if (globalThis.__refreshRSCRoot__) {
        await globalThis.__refreshRSCRoot__(changedModules);
        smartRefreshLogger.debug("RSC root refreshed");

        // Restore scroll position
        globalThis.scrollTo(scrollX, scrollY);
      } else {
        // Fallback: full reload if refresh function not available
        smartRefreshLogger.warn(
          "Refresh function not available, falling back to full reload",
        );
        globalThis.location.reload();
      }

      smartRefreshLogger.debug("Refresh completed successfully");
    } catch (error) {
      smartRefreshLogger.error("Refresh failed:", { error });
      smartRefreshLogger.warn("Falling back to full reload");
      globalThis.location.reload();
    } finally {
      globalThis.__REFRESH_PENDING__ = false;
    }
  };

  // Export flag for HMR client
  globalThis.__SMART_REFRESH_ENABLED__ = true;
}

/**
 * Trigger a smart refresh with optional module list
 * @param changedModules - List of changed module paths
 */
export async function triggerSmartRefresh(
  changedModules?: string[],
): Promise<void> {
  if (globalThis.__performSmartRefresh__) {
    await globalThis.__performSmartRefresh__(changedModules);
  } else {
    // Fallback: full reload if not initialized
    globalThis.location.reload();
  }
}

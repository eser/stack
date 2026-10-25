// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Smart Refresh Module
 * Implements module-aware refresh without full page reload
 * Preserves scroll position and browser state
 */

import * as logging from "@eserstack/logging";
import type { LarouxGlobalThis } from "./globals.d.ts";

// The page-wide state the laroux client keeps on globalThis, with its types.
const larouxGlobals = globalThis as LarouxGlobalThis;

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
  const manifest = larouxGlobals.__CHUNK_MANIFEST__;
  if (manifest === undefined) return false;

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
  larouxGlobals.__REFRESH_PENDING__ = false;

  // Track last changed modules for debugging
  larouxGlobals.__LAST_CHANGED_MODULES__ = [];

  // Helper to perform a smart refresh with module awareness
  larouxGlobals.__performSmartRefresh__ = async function (
    changedModules?: string[],
  ) {
    if (larouxGlobals.__REFRESH_PENDING__ === true) {
      smartRefreshLogger.debug("Refresh already pending, skipping");
      return;
    }

    larouxGlobals.__REFRESH_PENDING__ = true;

    try {
      // Store changed modules for debugging
      larouxGlobals.__LAST_CHANGED_MODULES__ = changedModules ?? [];

      if (changedModules !== undefined && changedModules.length > 0) {
        smartRefreshLogger.with({ changedModules }).debug("Modules changed");
      } else {
        smartRefreshLogger.debug("Starting refresh (no module info)");
      }

      // Check if any changed modules are client components or bundler infrastructure
      // If so, we need a full page reload to get the updated JavaScript bundle
      const hasClientComponentChanges = changedModules?.some((module) =>
        requiresFullReload(module)
      );

      if (hasClientComponentChanges === true) {
        const matchedModules = changedModules?.filter((module) =>
          requiresFullReload(module)
        );
        smartRefreshLogger.with({ matchedModules }).debug(
          "Client component(s) changed, performing full page reload",
        );
        globalThis.location.reload();
        return;
      }

      // Server component or non-client file changed - do smart refresh
      smartRefreshLogger.with({ changedModules }).debug(
        "Server component(s) changed, performing smart refresh",
      );

      // Save scroll position to restore after refresh
      const scrollX = globalThis.scrollX;
      const scrollY = globalThis.scrollY;

      // Clear the RSC promise cache so it refetches
      if (larouxGlobals.__clearRSCCache__ !== undefined) {
        larouxGlobals.__clearRSCCache__(changedModules);
        smartRefreshLogger.debug("RSC cache cleared");
      }

      // Trigger a re-render by calling the refresh function
      if (larouxGlobals.__refreshRSCRoot__ !== undefined) {
        await larouxGlobals.__refreshRSCRoot__(changedModules);
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
      smartRefreshLogger.with({ error }).error("Refresh failed");
      smartRefreshLogger.warn("Falling back to full reload");
      globalThis.location.reload();
    } finally {
      larouxGlobals.__REFRESH_PENDING__ = false;
    }
  };

  // Export flag for HMR client
  larouxGlobals.__SMART_REFRESH_ENABLED__ = true;
}

/**
 * Trigger a smart refresh with optional module list
 * @param changedModules - List of changed module paths
 */
export async function triggerSmartRefresh(
  changedModules?: string[],
): Promise<void> {
  if (larouxGlobals.__performSmartRefresh__ !== undefined) {
    await larouxGlobals.__performSmartRefresh__(changedModules);
  } else {
    // Fallback: full reload if not initialized
    globalThis.location.reload();
  }
}

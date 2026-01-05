// Route definitions for the application
// Supports hybrid mode: auto-generated routes + manual overrides

import type { RouteDefinition } from "@eser/laroux-core/router";
import * as logging from "@eser/logging";

const routesLogger = logging.logger.getLogger(["app", "routes"]);

// Import generated routes from dist/server/ (created by build system)
// Falls back to empty array if not yet generated
// NOTE: Routes are generated to dist/ for build isolation (source files remain read-only)
let generatedRoutes: RouteDefinition[] = [];
try {
  // Detect if we're running from src/ or dist/server/src/
  // and compute the absolute URL for the generated routes file
  const currentUrl = import.meta.url;
  const isInDist = currentUrl.includes("/dist/server/");

  // Resolve the correct path based on where we're running from
  // From src/app/routes/: ../../../dist/server/_generated-routes.ts
  // From dist/server/src/app/routes/: ../../../_generated-routes.ts
  const relativePath = isInDist
    ? "../../../_generated-routes.ts"
    : "../../../dist/server/_generated-routes.ts";

  // Use import.meta.resolve to get the absolute URL, then import
  const resolvedUrl = import.meta.resolve(relativePath);
  const generated = await import(resolvedUrl);
  generatedRoutes = generated.generatedRoutes;
  routesLogger.info(`Successfully loaded ${generatedRoutes.length} route(s)`);
} catch (error) {
  routesLogger.error("Failed to load generated routes:", error);
  // Routes file doesn't exist yet - will be created on first build
}

/**
 * Manual route overrides (take precedence over auto-generated routes)
 */
const manualRoutes: RouteDefinition[] = [];

/**
 * Merge manual routes with generated routes
 * Manual routes take precedence over generated routes with the same path
 */
function mergeRoutes(
  manual: RouteDefinition[],
  generated: RouteDefinition[],
): RouteDefinition[] {
  const manualPaths = new Set(manual.map((r) => r.path));
  return [
    ...manual,
    ...generated.filter((r) => !manualPaths.has(r.path)),
  ];
}

/**
 * Application routes
 * Merged from manual overrides and auto-generated file-based routes
 */
export const routes: RouteDefinition[] = mergeRoutes(
  manualRoutes,
  generatedRoutes,
);

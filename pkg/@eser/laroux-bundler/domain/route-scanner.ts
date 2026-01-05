// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Route scanner for file-based routing
// Scans src/app/routes for page.tsx, layout.tsx, route.ts, and proxy.ts files

import { runtime, toPosix } from "@eser/standards/runtime";
import { walkFiles } from "@eser/collector";
import * as logging from "@eser/logging";

const scannerLogger = logging.logger.getLogger([
  "laroux-bundler",
  "route-scanner",
]);

// Module-level cache for route scanning
let cachedResult: ScanResult | null = null;
let cachedRoutesDirMtime: number = 0;

export type ScannedRoute = {
  routePath: string; // "/stories/[slug]"
  componentPath: string; // "src/app/routes/stories/[slug]/page.tsx"
  layoutPath?: string; // "src/app/routes/stories/[slug]/layout.tsx"
  isApiRoute: boolean; // true if route.ts exists
  proxyPath?: string; // "src/app/routes/stories/proxy.ts"
};

export type ScannedProxy = {
  pathPrefix: string; // "/admin"
  modulePath: string; // "src/app/routes/admin/proxy.ts"
};

export type ScanResult = {
  routes: ScannedRoute[];
  apiRoutes: ScannedRoute[];
  proxies: ScannedProxy[];
};

type DirectoryEntry = {
  pagePath?: string;
  layoutPath?: string;
  routePath?: string;
  proxyPath?: string;
};

// Pattern to ignore private directories and test files
const IGNORE_PATTERN = /(?:^|[/\\])(?:_[^/\\]*|.*\.test\.tsx?)$/;

// Route file names we're looking for
const ROUTE_FILES = new Set(["page.tsx", "layout.tsx", "route.ts", "proxy.ts"]);

/**
 * Invalidate the route cache
 * Call this when route files change in watch mode
 */
export function invalidateRouteCache(): void {
  cachedResult = null;
  cachedRoutesDirMtime = 0;
  scannerLogger.debug("Route cache invalidated");
}

/**
 * Scans the routes directory for page, layout, route, and proxy files
 * Uses @eser/collector for file walking
 * Implements caching for faster incremental builds
 * @param routesDir - The routes directory path (src/app/routes)
 * @param projectRoot - The project root directory
 * @param forceRescan - Force a rescan even if cache is valid
 * @returns Scan result containing routes, API routes, and proxies
 */
export async function scanRoutes(
  routesDir: string,
  projectRoot: string,
  forceRescan = false,
): Promise<ScanResult> {
  // Check if cache is valid
  if (!forceRescan && cachedResult) {
    try {
      const routesDirStat = await runtime.fs.stat(routesDir);
      const mtime = routesDirStat.mtime?.getTime() ?? 0;

      if (mtime <= cachedRoutesDirMtime) {
        scannerLogger.debug("Using cached route scan result");
        return cachedResult;
      }
    } catch {
      // Directory might not exist, continue with scan
    }
  }

  scannerLogger.debug(`Scanning routes in: ${routesDir}`);

  // Group files by directory
  const dirEntries = new Map<string, DirectoryEntry>();

  // Walk all files using @eser/collector
  for await (
    const relativePath of walkFiles(routesDir, undefined, IGNORE_PATTERN)
  ) {
    const fileName = runtime.path.basename(relativePath);

    // Only process route files
    if (!ROUTE_FILES.has(fileName)) {
      continue;
    }

    const dirPath = runtime.path.dirname(relativePath);
    const dirEntry = dirEntries.get(dirPath) ?? {};

    const fullPath = runtime.path.join(routesDir, relativePath);

    if (fileName === "page.tsx") {
      dirEntry.pagePath = fullPath;
    } else if (fileName === "layout.tsx") {
      dirEntry.layoutPath = fullPath;
    } else if (fileName === "route.ts") {
      dirEntry.routePath = fullPath;
    } else if (fileName === "proxy.ts") {
      dirEntry.proxyPath = fullPath;
    }

    dirEntries.set(dirPath, dirEntry);
  }

  // Build routes from grouped entries
  const routes: ScannedRoute[] = [];
  const apiRoutes: ScannedRoute[] = [];
  const proxies: ScannedProxy[] = [];

  // Helper to find closest parent layout for a directory path
  const findParentLayout = (dirPath: string): string | undefined => {
    let currentDir = dirPath;
    while (currentDir && currentDir !== ".") {
      const parentDir = runtime.path.dirname(currentDir);
      if (parentDir === currentDir) break; // Reached root

      const parentEntry = dirEntries.get(parentDir);
      if (parentEntry?.layoutPath) {
        return runtime.path.relative(projectRoot, parentEntry.layoutPath);
      }
      currentDir = parentDir;
    }
    return undefined;
  };

  for (const [dirPath, entries] of dirEntries) {
    const routePath = directoryToRoutePath(dirPath);

    // Add page route
    if (entries.pagePath) {
      const componentPath = runtime.path.relative(
        projectRoot,
        entries.pagePath,
      );
      // Use own layout if present, otherwise inherit from closest parent
      const layoutPath = entries.layoutPath
        ? runtime.path.relative(projectRoot, entries.layoutPath)
        : findParentLayout(dirPath);

      routes.push({
        routePath,
        componentPath,
        layoutPath,
        isApiRoute: false,
      });

      scannerLogger.debug(
        `Found page: ${routePath} -> ${componentPath}${
          layoutPath ? ` (layout: ${layoutPath})` : ""
        }`,
      );
    }

    // Add API route
    if (entries.routePath) {
      const componentPath = runtime.path.relative(
        projectRoot,
        entries.routePath,
      );

      apiRoutes.push({
        routePath,
        componentPath,
        isApiRoute: true,
      });

      scannerLogger.debug(`Found API route: ${routePath} -> ${componentPath}`);
    }

    // Add proxy
    if (entries.proxyPath) {
      const modulePath = runtime.path.relative(projectRoot, entries.proxyPath);

      proxies.push({
        pathPrefix: routePath || "/",
        modulePath,
      });

      scannerLogger.debug(`Found proxy: ${routePath || "/"} -> ${modulePath}`);
    }
  }

  // Sort routes by specificity (static > dynamic > catch-all)
  const sortedRoutes = sortRoutesBySpecificity(routes);
  const sortedApiRoutes = sortRoutesBySpecificity(apiRoutes);
  const sortedProxies = sortProxiesBySpecificity(proxies);

  scannerLogger.debug(
    `Found ${sortedRoutes.length} page routes, ${sortedApiRoutes.length} API routes, ${sortedProxies.length} proxies`,
  );

  const result: ScanResult = {
    routes: sortedRoutes,
    apiRoutes: sortedApiRoutes,
    proxies: sortedProxies,
  };

  // Cache the result for future builds
  try {
    const routesDirStat = await runtime.fs.stat(routesDir);
    cachedRoutesDirMtime = routesDirStat.mtime?.getTime() ?? 0;
  } catch {
    // Ignore caching errors
  }
  cachedResult = result;

  return result;
}

/**
 * Converts a directory path relative to routes dir into a URL route path
 * Examples:
 *   "home" -> "/"
 *   "stories" -> "/stories"
 *   "stories/[slug]" -> "/stories/[slug]"
 *   "[slug]/[pageslug]" -> "/[slug]/[pageslug]"
 */
function directoryToRoutePath(relativePath: string): string {
  // Handle root directory (empty string)
  if (!relativePath || relativePath === ".") {
    return "/";
  }

  // Special case: "home" directory maps to root "/"
  if (relativePath === "home") {
    return "/";
  }

  // Convert to POSIX format and add leading slash
  return `/${toPosix(relativePath)}`;
}

/**
 * Sort routes by specificity:
 * 1. Static routes first (no dynamic segments)
 * 2. Dynamic routes ([param])
 * 3. Catch-all routes ([...slug]) last
 * Within each category, longer paths come first
 */
function sortRoutesBySpecificity(routes: ScannedRoute[]): ScannedRoute[] {
  return routes.sort((a, b) => {
    const scoreA = getRouteSpecificityScore(a.routePath);
    const scoreB = getRouteSpecificityScore(b.routePath);

    // Higher score = more specific = comes first
    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }

    // Same specificity, longer path comes first
    return b.routePath.length - a.routePath.length;
  });
}

/**
 * Calculate specificity score for a route
 * Higher score = more specific
 */
function getRouteSpecificityScore(routePath: string): number {
  let score = 0;

  // Base score from number of segments (more segments = more specific)
  const segments = routePath.split("/").filter(Boolean);
  score += segments.length * 10;

  // Deduct points for dynamic segments
  for (const segment of segments) {
    if (segment.startsWith("[...")) {
      // Catch-all: large deduction
      score -= 100;
    } else if (segment.startsWith("[")) {
      // Dynamic: small deduction
      score -= 5;
    } else {
      // Static: bonus
      score += 3;
    }
  }

  return score;
}

/**
 * Sort proxies by specificity (longer/more specific prefixes first)
 */
function sortProxiesBySpecificity(proxies: ScannedProxy[]): ScannedProxy[] {
  return proxies.sort((a, b) => {
    // Longer prefix = more specific = comes first
    return b.pathPrefix.length - a.pathPrefix.length;
  });
}

/**
 * Gets the exported component name from a page.tsx file
 * Assumes the component is exported as a named export or default export
 */
export function getComponentName(componentPath: string): string {
  // Get parent directory name
  const dirName = runtime.path.basename(runtime.path.dirname(componentPath));

  // Generate a PascalCase component name from directory
  const name = dirName === "home" ? "HomePage" : `${toPascalCase(dirName)}Page`;

  return name;
}

/**
 * Gets the layout component name from a layout.tsx file
 */
export function getLayoutName(layoutPath: string): string {
  const dirName = runtime.path.basename(runtime.path.dirname(layoutPath));
  return `${toPascalCase(dirName)}Layout`;
}

/**
 * Converts a string to PascalCase
 */
function toPascalCase(str: string): string {
  // Handle dynamic segments like [slug]
  if (str.startsWith("[") && str.endsWith("]")) {
    const inner = str.slice(1, -1);
    // Handle catch-all [...slug]
    if (inner.startsWith("...")) {
      return toPascalCase(inner.slice(3));
    }
    return toPascalCase(inner);
  }

  return str
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

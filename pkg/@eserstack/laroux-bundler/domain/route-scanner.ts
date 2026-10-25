// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Route scanner for file-based routing
// Scans src/app/routes for page.tsx, layout.tsx, route.ts, and proxy.ts files

import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as patterns from "@eserstack/standards/patterns";
import * as collector from "@eserstack/collector";
import * as logging from "@eserstack/logging";

const scannerLogger = logging.logger.getLogger([
  "laroux-bundler",
  "route-scanner",
]);

/** A page or API route found under the routes directory. */
export type ScannedRoute = {
  /** URL pattern, such as "/stories/[slug]" */
  routePath: string;
  /** Module path from the project root, such as "src/app/routes/stories/[slug]/page.tsx" */
  componentPath: string;
  /** The page's own layout or its closest parent's, from the project root */
  layoutPath?: string;
  /** True for a route.ts handler, false for a page */
  isApiRoute: boolean;
  /** Proxy module that applies to the route, from the project root */
  proxyPath?: string;
};

/** A proxy.ts module found under the routes directory. */
export type ScannedProxy = {
  /** URL prefix the proxy applies to, such as "/admin" */
  pathPrefix: string;
  /** Module path from the project root, such as "src/app/routes/admin/proxy.ts" */
  modulePath: string;
};

/** The routes, API routes and proxies of one routes directory. */
export type ScanResult = {
  /** Page routes, most specific first */
  routes: ScannedRoute[];
  /** API routes, most specific first */
  apiRoutes: ScannedRoute[];
  /** Proxies, longest prefix first */
  proxies: ScannedProxy[];
};

/**
 * Keeps scan results between builds, per routes directory. BuildCache
 * implements it; watch mode drops an entry when a file under its routes
 * directory changes.
 */
export type RouteScanCache = {
  /**
   * The cached scan of routesDir, or null when there is none or the routes
   * directory changed after it (its mtime is newer than the entry's).
   */
  getRouteScan(routesDir: string, routesDirMtime: number): ScanResult | null;
  /** Store the scan of routesDir, made when the directory had this mtime. */
  setRouteScan(
    routesDir: string,
    result: ScanResult,
    routesDirMtime: number,
  ): void;
};

/** Options of {@link scanRoutes}. */
export type ScanRoutesOptions = {
  /**
   * Cache to reuse a scan of the same routes directory from an earlier
   * build. Without one, every call scans the directory.
   */
  readonly cache?: RouteScanCache;
};

type DirectoryEntry = {
  pagePath?: string;
  layoutPath?: string;
  routePath?: string;
  proxyPath?: string;
};

// Skips test files and every path with a segment that starts with "_": a
// file such as _helpers.tsx and everything below a directory such as
// _private/ stay private to the app. The pattern is matched against the path
// relative to the routes directory, so a "_" above it does not count.
const IGNORE_PATTERN = /(?:^|[/\\])_|\.test\.[cm]?[jt]sx?$/;

// Route file base names (without extension)
const ROUTE_FILE_BASES = ["page", "layout", "route", "proxy"];

// Generate all valid route file names with supported extensions
const ROUTE_FILES = new Set(
  ROUTE_FILE_BASES.flatMap((base) =>
    patterns.JS_FILE_EXTENSIONS.map((ext) => `${base}.${ext}`),
  ),
);

/**
 * Get the base name of a route file (without extension)
 */
function getRouteFileBase(fileName: string): string | null {
  for (const base of ROUTE_FILE_BASES) {
    if (
      fileName.startsWith(`${base}.`) &&
      patterns.JS_FILE_PATTERN.test(fileName)
    ) {
      return base;
    }
  }
  return null;
}

/**
 * Read the modification time of the routes directory, or null when it does
 * not exist or the file system reports none.
 */
async function readRoutesDirMtime(routesDir: string): Promise<number | null> {
  try {
    const routesDirStat = await crossRuntime.runtime.fs.stat(routesDir);
    return routesDirStat.mtime?.getTime() ?? null;
  } catch (error) {
    if (error instanceof crossRuntime.NotFoundError) {
      return null;
    }
    throw error;
  }
}

/**
 * Scans the routes directory for page, layout, route, and proxy files
 * Test files and anything in or below an `_`-prefixed file or directory are
 * skipped, so `_private/page.tsx` is never routed
 * Uses @eserstack/collector for file walking
 * @param routesDir - The routes directory path (src/app/routes)
 * @param projectRoot - The project root directory
 * @param options - A cache to reuse an earlier scan of the same directory;
 *   without one, the directory is scanned every time
 * @returns Scan result containing routes, API routes, and proxies
 */
export async function scanRoutes(
  routesDir: string,
  projectRoot: string,
  options: ScanRoutesOptions = {},
): Promise<ScanResult> {
  const { cache } = options;
  const routesDirMtime =
    cache !== undefined ? await readRoutesDirMtime(routesDir) : null;

  if (cache !== undefined && routesDirMtime !== null) {
    const cached = cache.getRouteScan(routesDir, routesDirMtime);
    if (cached !== null) {
      scannerLogger.debug(`Using cached route scan of ${routesDir}`);
      return cached;
    }
  }

  scannerLogger.debug(`Scanning routes in: ${routesDir}`);

  // Group files by directory
  const dirEntries = new Map<string, DirectoryEntry>();

  // Walk all files using @eserstack/collector
  for await (const relativePath of collector.walkFiles(
    routesDir,
    undefined,
    IGNORE_PATTERN,
  )) {
    const fileName = crossRuntime.runtime.path.basename(relativePath);

    // Only process route files
    if (!ROUTE_FILES.has(fileName)) {
      continue;
    }

    const dirPath = crossRuntime.runtime.path.dirname(relativePath);
    const dirEntry = dirEntries.get(dirPath) ?? {};

    const fullPath = crossRuntime.runtime.path.join(routesDir, relativePath);

    const base = getRouteFileBase(fileName);
    if (base === "page") {
      dirEntry.pagePath = fullPath;
    } else if (base === "layout") {
      dirEntry.layoutPath = fullPath;
    } else if (base === "route") {
      dirEntry.routePath = fullPath;
    } else if (base === "proxy") {
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
      const parentDir = crossRuntime.runtime.path.dirname(currentDir);
      if (parentDir === currentDir) break; // Reached root

      const parentEntry = dirEntries.get(parentDir);
      if (parentEntry?.layoutPath) {
        return crossRuntime.runtime.path.relative(
          projectRoot,
          parentEntry.layoutPath,
        );
      }
      currentDir = parentDir;
    }
    return undefined;
  };

  for (const [dirPath, entries] of dirEntries) {
    const routePath = directoryToRoutePath(dirPath);

    // Add page route
    if (entries.pagePath) {
      const componentPath = crossRuntime.runtime.path.relative(
        projectRoot,
        entries.pagePath,
      );
      // Use own layout if present, otherwise inherit from closest parent
      const layoutPath = entries.layoutPath
        ? crossRuntime.runtime.path.relative(projectRoot, entries.layoutPath)
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
      const componentPath = crossRuntime.runtime.path.relative(
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
      const modulePath = crossRuntime.runtime.path.relative(
        projectRoot,
        entries.proxyPath,
      );

      // directoryToRoutePath maps the root directory to "/", so the prefix is
      // never empty
      proxies.push({
        pathPrefix: routePath,
        modulePath,
      });

      scannerLogger.debug(`Found proxy: ${routePath} -> ${modulePath}`);
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

  // A directory without an mtime cannot be checked for changes, so its scan
  // is not cached.
  if (cache !== undefined && routesDirMtime !== null) {
    cache.setRouteScan(routesDir, result, routesDirMtime);
  }

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
  if (relativePath === "" || relativePath === ".") {
    return "/";
  }

  // Special case: "home" directory maps to root "/"
  if (relativePath === "home") {
    return "/";
  }

  // Convert to POSIX format and add leading slash
  return `/${crossRuntime.toPosix(relativePath)}`;
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
  const dirName = crossRuntime.runtime.path.basename(
    crossRuntime.runtime.path.dirname(componentPath),
  );

  // Generate a PascalCase component name from directory
  const name = dirName === "home" ? "HomePage" : `${toPascalCase(dirName)}Page`;

  return name;
}

/**
 * Gets the layout component name from a layout.tsx file
 */
export function getLayoutName(layoutPath: string): string {
  const dirName = crossRuntime.runtime.path.basename(
    crossRuntime.runtime.path.dirname(layoutPath),
  );
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

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Route matching utilities
// Uses @eserstack/standards/routes for core matching logic

// The sub-path keeps the browser bundle free of the package root, whose
// cross-runtime module detects the runtime on import.
import * as routes from "@eserstack/standards/routes";
import type { RouteDefinition, RouteMatch, RouteParams } from "./types.ts";

/**
 * Matches a pathname against a route definition
 * Returns the extracted parameters if matched, or null if no match
 *
 * Only the route's `path` is read, so an API route entry matches the same way
 * as a page. The pathname is the one in the URL, percent-encoded as
 * `URL.pathname` gives it, and the params come back percent-decoded, with a
 * malformed escape kept as written. A catch-all (`[...path]`) matches zero or
 * more segments, its bare prefix included: "/docs/[...path]" matches "/docs"
 * and "/docs/" with `path` set to `[]`, so a path and its
 * {@link normalizePath} form reach the same route. A decoded value can hold
 * "/" or "..": validate it before it goes into a file path or a query.
 *
 * @example
 * ```typescript
 * import * as laroux from "@eserstack/laroux";
 *
 * laroux.matchRoute("/stories/hello%20world", { path: "/stories/[slug]" });
 * // { slug: "hello world" }
 *
 * laroux.matchRoute("/docs", { path: "/docs/[...path]" });
 * // { path: [] }
 * ```
 */
export function matchRoute(
  pathname: string,
  routeDef: Pick<RouteDefinition, "path">,
): RouteParams | null {
  const result = routes.matchRoute(pathname, routeDef.path);
  if (result === null) {
    return null;
  }
  // Convert readonly string[] to string[] for compatibility
  const params: RouteParams = {};
  for (const [key, value] of Object.entries(result)) {
    if (Array.isArray(value)) {
      params[key] = [...value];
    } else if (typeof value === "string") {
      params[key] = value;
    }
  }
  return params;
}

/**
 * Finds the first matching route for a given pathname
 * Routes should be ordered from most specific to least specific
 */
export function findMatchingRoute(
  pathname: string,
  routeDefs: readonly RouteDefinition[],
): RouteMatch | null {
  for (const route of routeDefs) {
    const params = matchRoute(pathname, route);
    if (params !== null) {
      return { route, params };
    }
  }
  return null;
}

/**
 * Normalizes a pathname by removing trailing slashes and ensuring leading slash
 */
export const normalizePath = (pathname: string): string =>
  routes.normalizePath(pathname);

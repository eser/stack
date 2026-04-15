// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Route matching utilities
// Uses @eserstack/standards/routes for core matching logic

import {
  matchRoute as baseMatchRoute,
  normalizePath as baseNormalizePath,
} from "@eserstack/standards/routes";
import type { RouteDefinition, RouteMatch, RouteParams } from "./types.ts";

/**
 * Matches a pathname against a route definition
 * Returns the extracted parameters if matched, or null if no match
 */
export function matchRoute(
  pathname: string,
  routeDef: RouteDefinition,
): RouteParams | null {
  const result = baseMatchRoute(pathname, routeDef.path);
  if (result === null) {
    return null;
  }
  // Convert readonly string[] to string[] for compatibility
  const params: RouteParams = {};
  for (const [key, value] of Object.entries(result)) {
    if (Array.isArray(value)) {
      params[key] = [...value] as string[];
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
  routes: RouteDefinition[],
): RouteMatch | null {
  for (const route of routes) {
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
export { baseNormalizePath as normalizePath };

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Route pattern matching utilities.
 * Supports [param] for single segments and [...param] for catch-all routes.
 *
 * @module
 */

import type {
  CompiledPattern,
  RouteDefinition,
  RouteMatch,
  RouteParams,
} from "./types.ts";

/**
 * Compile a route pattern to a regex and extract parameter names.
 * Supports [param] for single segments and [...param] for catch-all.
 *
 * @example
 * compilePattern("/stories/[slug]")
 * // { regex: /^\/stories\/([^/]+)$/, paramNames: ["slug"], catchAllParams: Set {} }
 *
 * compilePattern("/docs/[...path]")
 * // { regex: /^\/docs\/(.*)$/, paramNames: ["path"], catchAllParams: Set { "path" } }
 */
export const compilePattern = (pattern: string): CompiledPattern => {
  const paramNames: string[] = [];
  const catchAllParams = new Set<string>();

  // Handle catch-all routes [...slug] first, then dynamic segments [slug]
  const regexPattern = pattern
    .replace(/\[\.\.\.(\w+)\]/g, (_match, paramName: string) => {
      paramNames.push(paramName);
      catchAllParams.add(paramName);
      return "(.*)";
    })
    .replace(/\[(\w+)\]/g, (_match, paramName: string) => {
      paramNames.push(paramName);
      return "([^/]+)";
    })
    .replace(/\//g, "\\/");

  return {
    regex: new RegExp(`^${regexPattern}$`),
    paramNames,
    catchAllParams,
  };
};

/**
 * Match a pathname against a compiled pattern.
 * Returns extracted parameters or null if no match.
 */
export const matchPattern = (
  pathname: string,
  compiled: CompiledPattern,
): RouteParams | null => {
  const match = pathname.match(compiled.regex);

  if (match === null) {
    return null;
  }

  const params: Record<string, string | readonly string[]> = {};

  for (let i = 0; i < compiled.paramNames.length; i++) {
    const name = compiled.paramNames[i];
    const value = match[i + 1];

    if (name === undefined) {
      continue;
    }

    if (compiled.catchAllParams.has(name)) {
      // Split catch-all value by / and filter empty segments
      params[name] = value !== undefined && value !== ""
        ? value.split("/").filter(Boolean)
        : [];
    } else {
      params[name] = value ?? "";
    }
  }

  return params;
};

/**
 * Match a pathname against a route pattern string.
 * Convenience function that compiles and matches in one step.
 *
 * @example
 * matchRoute("/stories/hello", "/stories/[slug]")
 * // { slug: "hello" }
 *
 * matchRoute("/docs/a/b/c", "/docs/[...path]")
 * // { path: ["a", "b", "c"] }
 */
export const matchRoute = (
  pathname: string,
  pattern: string,
): RouteParams | null => {
  const compiled = compilePattern(pattern);
  return matchPattern(pathname, compiled);
};

/**
 * Find first matching route from a list of route definitions.
 * Routes should be ordered from most specific to least specific.
 *
 * @example
 * const routes = [
 *   { path: "/stories/featured", data: "featured" },
 *   { path: "/stories/[slug]", data: "story" },
 * ];
 * findMatchingRoute("/stories/hello", routes)
 * // { route: { path: "/stories/[slug]", data: "story" }, params: { slug: "hello" } }
 */
export const findMatchingRoute = <T>(
  pathname: string,
  routes: ReadonlyArray<RouteDefinition<T>>,
): RouteMatch<T> | null => {
  for (const route of routes) {
    const params = matchRoute(pathname, route.path);
    if (params !== null) {
      return { route, params };
    }
  }
  return null;
};

/**
 * Normalize a pathname by ensuring leading slash and removing trailing slash.
 * Root path "/" is preserved as-is.
 *
 * @example
 * normalizePath("stories/hello/") // "/stories/hello"
 * normalizePath("/") // "/"
 * normalizePath("") // "/"
 */
export const normalizePath = (pathname: string): string => {
  if (pathname === "" || pathname === "/") {
    return "/";
  }

  // Ensure leading slash
  let normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;

  // Remove trailing slash (except for root)
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
};

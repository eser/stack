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
 * Escape special regex characters in a string.
 * Escapes all characters that have special meaning in regular expressions.
 */
const escapeRegex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

/**
 * Compile a route pattern to a regex and extract parameter names.
 * Supports [param] for single segments and [...param] for catch-all.
 *
 * A catch-all matches zero or more segments. The slash before it is optional,
 * so "/docs/[...path]" matches "/docs" as well as "/docs/", and the form
 * {@link normalizePath} gives a path reaches the same route as the path itself.
 *
 * @example
 * compilePattern("/stories/[slug]")
 * // { regex: /^\/stories\/([^/]+)$/, paramNames: ["slug"], catchAllParams: Set {} }
 *
 * compilePattern("/docs/[...path]")
 * // { regex: /^\/docs(?:\/(.*))?$/, paramNames: ["path"], catchAllParams: Set { "path" } }
 */
export const compilePattern = (pattern: string): CompiledPattern => {
  const paramNames: string[] = [];
  const catchAllParams = new Set<string>();

  // Build regex by processing each segment
  // Match bracket patterns and process the rest as literals
  let regexPattern = "";
  let remaining = pattern;

  // Pattern for catch-all [...param] and regular [param]
  const bracketPattern = /\[(\.\.\.)?(\w+)\]/;

  while (remaining.length > 0) {
    const match = bracketPattern.exec(remaining);

    if (match === null) {
      // No more bracket patterns - escape and append the rest
      regexPattern += escapeRegex(remaining);
      break;
    }

    const literal = remaining.slice(0, match.index);
    const isCatchAll = match[1] === "...";
    // Group 2 is not optional, so every match has a name.
    const paramName = match[2] as string;

    paramNames.push(paramName);

    if (!isCatchAll) {
      regexPattern += `${escapeRegex(literal)}([^/]+)`;
    } else if (literal.endsWith("/")) {
      // The slash moves into the optional group, so the bare prefix ("/docs")
      // matches with no segments, as "/docs/" does.
      catchAllParams.add(paramName);
      regexPattern += `${escapeRegex(literal.slice(0, -1))}(?:/(.*))?`;
    } else {
      catchAllParams.add(paramName);
      regexPattern += `${escapeRegex(literal)}(.*)`;
    }

    // Move past this match
    remaining = remaining.slice(match.index + match[0].length);
  }

  return {
    regex: new RegExp(`^${regexPattern}$`),
    paramNames,
    catchAllParams,
  };
};

/**
 * Percent-decode one path segment. A segment with a malformed escape, such as
 * "100%", is returned as written: a browser sends such a path unchanged, and
 * failing the match would answer it with a 404.
 */
const decodeSegment = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch (error) {
    if (error instanceof URIError) {
      return segment;
    }

    throw error;
  }
};

/**
 * Split a catch-all value into its non-empty segments, each percent-decoded.
 * Splitting first keeps an encoded slash ("%2F") inside its segment.
 */
const decodeSegments = (value: string): readonly string[] =>
  value
    .split("/")
    .filter((segment) => segment !== "")
    .map(decodeSegment);

/**
 * Match a pathname against a compiled pattern.
 * Returns extracted parameters or null if no match.
 *
 * The pathname is the one in the URL, percent-encoded as `URL.pathname` gives
 * it, and the pattern's static parts are compared with it as written. Param
 * values come back percent-decoded. A catch-all is split at "/" before its
 * segments are decoded, so an encoded slash ("%2F") stays inside its segment,
 * and empty segments are dropped. A segment with a malformed escape keeps its
 * raw form. A decoded value can hold any character, "/" and ".." included:
 * validate it before it goes into a file path, a query or a URL.
 *
 * @example
 * matchPattern("/stories/hello%20world", compilePattern("/stories/[slug]"))
 * // { slug: "hello world" }
 *
 * matchPattern("/docs/a%2Fb/c", compilePattern("/docs/[...path]"))
 * // { path: ["a/b", "c"] }
 */
export const matchPattern = (
  pathname: string,
  compiled: CompiledPattern,
): RouteParams | null => {
  const match = compiled.regex.exec(pathname);

  if (match === null) {
    return null;
  }

  const params: Record<string, string | readonly string[]> = {};

  compiled.paramNames.forEach((name, index) => {
    const value = match[index + 1];

    if (compiled.catchAllParams.has(name)) {
      // The value is undefined when the catch-all's optional group took no
      // part in the match, as for the bare prefix "/docs".
      params[name] = value === undefined ? [] : decodeSegments(value);
      return;
    }

    params[name] = decodeSegment(value ?? "");
  });

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
 *
 * matchRoute("/docs", "/docs/[...path]")
 * // { path: [] }
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

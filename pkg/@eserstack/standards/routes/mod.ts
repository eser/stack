// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Route pattern matching utilities.
 *
 * Provides functions for matching URL pathnames against route patterns
 * with support for dynamic segments `[param]` and catch-all routes `[...param]`.
 *
 * @example
 * ```typescript
 * import * as standards from "@eserstack/standards";
 *
 * // Match a single route
 * const params = standards.routes.matchRoute("/stories/hello", "/stories/[slug]");
 * // { slug: "hello" }
 *
 * // Params come back percent-decoded
 * standards.routes.matchRoute("/stories/hello%20world", "/stories/[slug]");
 * // { slug: "hello world" }
 *
 * // A catch-all matches its bare prefix with no segments
 * standards.routes.matchRoute("/docs", "/docs/[...path]");
 * // { path: [] }
 *
 * // Match against multiple routes
 * const routes = [
 *   { path: "/stories/featured", data: "featured" },
 *   { path: "/stories/[slug]", data: "story" },
 * ];
 * const result = standards.routes.findMatchingRoute("/stories/hello", routes);
 * // { route: { path: "/stories/[slug]", data: "story" }, params: { slug: "hello" } }
 *
 * // Normalize paths
 * standards.routes.normalizePath("stories/hello/"); // "/stories/hello"
 * ```
 *
 * @module
 */

export {
  type CompiledPattern,
  type RouteDefinition,
  type RouteMatch,
  type RouteParams,
} from "./types.ts";
export {
  compilePattern,
  findMatchingRoute,
  matchPattern,
  matchRoute,
  normalizePath,
} from "./matcher.ts";

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Route pattern matching utilities.
 *
 * Provides functions for matching URL pathnames against route patterns
 * with support for dynamic segments `[param]` and catch-all routes `[...param]`.
 *
 * @example
 * ```typescript
 * import { matchRoute, findMatchingRoute, normalizePath } from "@eser/standards/routes";
 *
 * // Match a single route
 * const params = matchRoute("/stories/hello", "/stories/[slug]");
 * // { slug: "hello" }
 *
 * // Match against multiple routes
 * const routes = [
 *   { path: "/stories/featured", data: "featured" },
 *   { path: "/stories/[slug]", data: "story" },
 * ];
 * const result = findMatchingRoute("/stories/hello", routes);
 * // { route: { path: "/stories/[slug]", data: "story" }, params: { slug: "hello" } }
 *
 * // Normalize paths
 * normalizePath("stories/hello/"); // "/stories/hello"
 * ```
 *
 * @module
 */

export * from "./types.ts";
export * from "./matcher.ts";

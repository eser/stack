// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Route pattern matching types.
 *
 * @module
 */

/**
 * Route parameter values - string for single params, string[] for catch-all.
 */
export interface RouteParams {
  readonly [key: string]: string | readonly string[];
}

/**
 * Result of matching a route.
 */
export interface RouteMatch<T = unknown> {
  readonly route: RouteDefinition<T>;
  readonly params: RouteParams;
}

/**
 * Route definition with pattern and associated data.
 */
export interface RouteDefinition<T = unknown> {
  readonly path: string; // e.g., "/stories/[slug]" or "/docs/[...slug]"
  readonly data: T;
}

/**
 * Compiled pattern with regex and parameter names.
 */
export interface CompiledPattern {
  readonly regex: RegExp;
  readonly paramNames: readonly string[];
  readonly catchAllParams: ReadonlySet<string>;
}

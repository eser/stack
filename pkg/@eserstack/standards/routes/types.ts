// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Route pattern matching types.
 *
 * @module
 */

/**
 * Route parameter values - string for single params, string[] for catch-all.
 * Values are percent-decoded.
 */
export interface RouteParams {
  /** A param's decoded value: a string for `[slug]`, the segments for `[...slug]`. */
  readonly [key: string]: string | readonly string[];
}

/**
 * Result of matching a route.
 */
export interface RouteMatch<T = unknown> {
  /** The route that matched. */
  readonly route: RouteDefinition<T>;
  /** The values of the route's params, by param name. */
  readonly params: RouteParams;
}

/**
 * Route definition with pattern and associated data.
 */
export interface RouteDefinition<T = unknown> {
  /** The route pattern, such as "/stories/[slug]" or "/docs/[...slug]". */
  readonly path: string;
  /** The value the route carries, returned with a match. */
  readonly data: T;
}

/**
 * Compiled pattern with regex and parameter names.
 */
export interface CompiledPattern {
  /** Matches a whole pathname and captures each param in order. */
  readonly regex: RegExp;
  /** The param names in the order the pattern lists them. */
  readonly paramNames: readonly string[];
  /** The names of the catch-all params (`[...name]`). */
  readonly catchAllParams: ReadonlySet<string>;
}

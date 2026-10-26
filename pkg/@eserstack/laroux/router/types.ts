// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Router types for laroux.js
// Framework-agnostic types - specific frameworks extend these

/**
 * Route parameters extracted from URL path segments, percent-decoded
 */
export interface RouteParams {
  /** A param's decoded value: a string for `[slug]`, the segments for `[...slug]`. */
  [key: string]: string | string[];
}

/**
 * Result of matching a URL path against route definitions
 */
export interface RouteMatch {
  /** The route that matched. */
  route: RouteDefinition;
  /** Values of the route's dynamic segments, by segment name. */
  params: RouteParams;
}

/**
 * Generic component type - frameworks provide concrete implementations
 * Using 'unknown' to avoid framework-specific type imports
 */
export type ComponentType = unknown;

/**
 * Route definition - framework-agnostic structure
 * Component types are loosely typed to allow any framework's component type
 */
export interface RouteDefinition {
  /** The route pattern, such as "/stories/[slug]". */
  path: string;
  /** The page component the route renders. */
  component: ComponentType;
  /** The layout that wraps the page, when the route has one. */
  layout?: ComponentType;
  /** Loads data for the page from the route's parameters. */
  loader?: (params: RouteParams) => Promise<unknown>;
}

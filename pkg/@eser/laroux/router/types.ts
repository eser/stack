// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Router types for laroux.js
// Framework-agnostic types - specific frameworks extend these

/**
 * Route parameters extracted from URL path segments
 */
export interface RouteParams {
  [key: string]: string | string[];
}

/**
 * Result of matching a URL path against route definitions
 */
export interface RouteMatch {
  route: RouteDefinition;
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
  path: string; // e.g., "/stories/[slug]"
  component: ComponentType;
  layout?: ComponentType;
  loader?: (params: RouteParams) => Promise<unknown>;
}

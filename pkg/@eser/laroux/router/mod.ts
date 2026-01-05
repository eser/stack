// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Router module for @eser/laroux
// Framework-agnostic routing utilities

export { findMatchingRoute, matchRoute, normalizePath } from "./matcher.ts";
export type {
  ComponentType,
  RouteDefinition,
  RouteMatch,
  RouteParams,
} from "./types.ts";

// API route types and helpers
export { errorResponse, HttpError, jsonResponse } from "./api-types.ts";
export type {
  ApiContext,
  ApiHandler,
  ApiRouteDefinition,
  ApiRouteModule,
  HttpMethod,
} from "./api-types.ts";

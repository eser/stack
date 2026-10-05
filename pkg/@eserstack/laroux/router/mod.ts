// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Router module for @eserstack/laroux
// Framework-agnostic routing utilities

export { findMatchingRoute, matchRoute, normalizePath } from "./matcher.ts";
export type {
  ComponentType,
  RouteDefinition,
  RouteMatch,
  RouteParams,
} from "./types.ts";

// Request data for pages and layouts
export { createPageRequest, parseCookieHeader } from "./page-request.ts";
export type {
  LayoutProps,
  PageProps,
  PageRequest,
  PageRequestInput,
} from "./page-request.ts";

// API route types and helpers
export { errorResponse, HttpError, jsonResponse } from "./api-types.ts";
export type {
  ApiContext,
  ApiHandler,
  ApiRouteDefinition,
  ApiRouteModule,
  HttpMethod,
} from "./api-types.ts";

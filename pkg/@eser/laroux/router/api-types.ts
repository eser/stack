// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// API route types for laroux.js
// Defines the types for file-based API routes (route.ts files)

import type { RouteParams } from "./types.ts";

/**
 * Context passed to API route handlers
 */
export type ApiContext = {
  /** The original request object */
  request: Request;
  /** Route parameters extracted from the URL path */
  params: RouteParams;
  /** URL search parameters (query string) */
  searchParams: URLSearchParams;
};

/**
 * API route handler function type
 * Returns a Response or Promise<Response>
 */
export type ApiHandler = (ctx: ApiContext) => Response | Promise<Response>;

/**
 * HTTP methods supported by API routes
 */
export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "HEAD"
  | "OPTIONS";

/**
 * API route module exports
 * Each method export becomes a handler for that HTTP method
 */
export type ApiRouteModule = {
  GET?: ApiHandler;
  POST?: ApiHandler;
  PUT?: ApiHandler;
  DELETE?: ApiHandler;
  PATCH?: ApiHandler;
  HEAD?: ApiHandler;
  OPTIONS?: ApiHandler;
};

/**
 * API route definition for the registry
 */
export type ApiRouteDefinition = {
  /** Route path pattern (e.g., "/api/users/[id]") */
  path: string;
  /** Path to the route.ts module */
  modulePath: string;
};

/**
 * Helper to create JSON responses with proper headers
 */
export function jsonResponse(
  data: unknown,
  init?: ResponseInit,
): Response {
  return new Response(JSON.stringify(data), {
    status: init?.status ?? 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...init?.headers,
    },
  });
}

/**
 * Helper to create error responses
 */
export function errorResponse(
  message: string,
  status = 500,
  details?: unknown,
): Response {
  return jsonResponse(
    {
      error: message,
      ...(details !== undefined && { details }),
    },
    { status },
  );
}

/**
 * Standard HTTP error responses
 */
export const HttpError = {
  badRequest: (message = "Bad Request"): Response =>
    errorResponse(message, 400),
  unauthorized: (message = "Unauthorized"): Response =>
    errorResponse(message, 401),
  forbidden: (message = "Forbidden"): Response => errorResponse(message, 403),
  notFound: (message = "Not Found"): Response => errorResponse(message, 404),
  methodNotAllowed: (message = "Method Not Allowed"): Response =>
    errorResponse(message, 405),
  conflict: (message = "Conflict"): Response => errorResponse(message, 409),
  unprocessable: (message = "Unprocessable Entity"): Response =>
    errorResponse(message, 422),
  internal: (message = "Internal Server Error"): Response =>
    errorResponse(message, 500),
};

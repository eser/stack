// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { MiddlewareFn } from "../types.ts";

/**
 * Configuration options for CORS middleware.
 */
export interface CorsOptions {
  /**
   * Allowed origins. Can be a string, array of strings, or a function that checks the origin.
   * Defaults to "*" (all origins).
   */
  origin?: string | string[] | ((origin: string) => boolean);

  /**
   * Allowed HTTP methods.
   * Defaults to ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"].
   */
  methods?: string[];

  /**
   * Headers that can be used in the actual request.
   * Defaults to [].
   */
  allowedHeaders?: string[];

  /**
   * Headers that browsers are allowed to access.
   * Defaults to [].
   */
  exposedHeaders?: string[];

  /**
   * Whether to include credentials in the request.
   * Defaults to false.
   */
  credentials?: boolean;

  /**
   * How long the results of a preflight request can be cached (in seconds).
   */
  maxAge?: number;
}

const DEFAULT_OPTIONS:
  & Required<
    Omit<CorsOptions, "origin" | "maxAge" | "exposedHeaders">
  >
  & {
    origin: string;
  } = {
    origin: "*",
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
    allowedHeaders: [],
    credentials: false,
  };

/**
 * Determines the allowed origin based on the request and configuration.
 */
const getAllowedOrigin = (
  requestOrigin: string,
  configOrigin: CorsOptions["origin"],
): string => {
  if (configOrigin === undefined || configOrigin === "*") {
    return "*";
  }

  if (typeof configOrigin === "string") {
    return configOrigin;
  }

  if (Array.isArray(configOrigin)) {
    return configOrigin.includes(requestOrigin) ? requestOrigin : "";
  }

  if (typeof configOrigin === "function") {
    return configOrigin(requestOrigin) ? requestOrigin : "";
  }

  return "";
};

/**
 * Adds CORS headers to a response.
 */
const addCorsHeaders = (
  headers: Headers,
  allowedOrigin: string,
  opts: CorsOptions,
): void => {
  if (allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
  }

  if (opts.credentials) {
    headers.set("Access-Control-Allow-Credentials", "true");
  }

  if (opts.exposedHeaders?.length) {
    headers.set(
      "Access-Control-Expose-Headers",
      opts.exposedHeaders.join(", "),
    );
  }

  // Vary header for caching
  if (allowedOrigin !== "*") {
    headers.append("Vary", "Origin");
  }
};

/**
 * Creates a CORS middleware function.
 *
 * @param options - CORS configuration options
 * @returns A middleware function that handles CORS
 *
 * @example
 * ```typescript
 * // Allow all origins
 * const corsMiddleware = cors();
 *
 * // Allow specific origins
 * const corsMiddleware = cors({
 *   origin: ["https://example.com", "https://app.example.com"],
 *   credentials: true,
 *   maxAge: 86400,
 * });
 *
 * // Use with custom origin check
 * const corsMiddleware = cors({
 *   origin: (origin) => origin.endsWith(".example.com"),
 * });
 * ```
 */
export const cors = (options: CorsOptions = {}): MiddlewareFn => {
  const opts: CorsOptions = { ...DEFAULT_OPTIONS, ...options };

  return async (
    req: Request,
    next: () => Response | Promise<Response>,
  ): Promise<Response> => {
    const requestOrigin = req.headers.get("Origin") ?? "";
    const allowedOrigin = getAllowedOrigin(requestOrigin, opts.origin);

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      const headers = new Headers();

      addCorsHeaders(headers, allowedOrigin, opts);

      // Preflight-specific headers
      if (opts.methods?.length) {
        headers.set("Access-Control-Allow-Methods", opts.methods.join(", "));
      }

      if (opts.allowedHeaders?.length) {
        headers.set(
          "Access-Control-Allow-Headers",
          opts.allowedHeaders.join(", "),
        );
      } else {
        // Mirror the requested headers
        const requestedHeaders = req.headers.get(
          "Access-Control-Request-Headers",
        );
        if (requestedHeaders) {
          headers.set("Access-Control-Allow-Headers", requestedHeaders);
        }
      }

      if (opts.maxAge !== undefined) {
        headers.set("Access-Control-Max-Age", String(opts.maxAge));
      }

      return new Response(null, { status: 204, headers });
    }

    // Handle actual requests
    const response = await next();
    const headers = new Headers(response.headers);

    addCorsHeaders(headers, allowedOrigin, opts);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
};

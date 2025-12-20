// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * @module @eser/http/middlewares
 *
 * Security middleware for the eser stack.
 * Provides CORS, CSP, and CSRF protection middleware.
 *
 * @example
 * ```typescript
 * import * as middlewares from "@eser/http/middlewares";
 *
 * // CORS - Cross-Origin Resource Sharing
 * const corsMiddleware = middlewares.cors.cors({
 *   origin: ["https://example.com"],
 *   credentials: true,
 * });
 *
 * // CSP - Content Security Policy
 * const cspMiddleware = middlewares.csp.csp({
 *   directives: {
 *     "default-src": "'self'",
 *     "script-src": ["'self'", "https://cdn.example.com"],
 *   },
 * });
 *
 * // CSRF - Cross-Site Request Forgery Protection
 * const csrfMiddleware = middlewares.csrf.csrf({
 *   excludePaths: ["/api/webhooks/*"],
 * });
 * ```
 */

export * as cors from "./cors.ts";
export * as csp from "./csp.ts";
export * as csrf from "./csrf.ts";

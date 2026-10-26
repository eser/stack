// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { MiddlewareFn } from "../types.ts";

/**
 * CSP directive names as defined by the Content Security Policy specification.
 */
export type CspDirective =
  | "default-src"
  | "script-src"
  | "style-src"
  | "img-src"
  | "connect-src"
  | "font-src"
  | "object-src"
  | "media-src"
  | "frame-src"
  | "child-src"
  | "worker-src"
  | "frame-ancestors"
  | "form-action"
  | "base-uri"
  | "manifest-src"
  | "report-uri"
  | "report-to"
  | "upgrade-insecure-requests"
  | "block-all-mixed-content";

/**
 * Configuration options for CSP middleware.
 */
export interface CspOptions {
  /**
   * CSP directives. Keys are directive names, values are the directive values.
   * Values can be a string or an array of strings.
   */
  directives?: Partial<Record<CspDirective, string | string[]>>;

  /**
   * If true, uses Content-Security-Policy-Report-Only header instead.
   * Useful for testing policies without enforcing them.
   * Defaults to false.
   */
  reportOnly?: boolean;

  /**
   * If true, generates a unique nonce for each request and adds it to script-src.
   * The nonce is available via the request state.
   * Defaults to false.
   */
  useNonce?: boolean;
}

/**
 * Default CSP directives providing a secure baseline.
 */
const DEFAULT_DIRECTIVES: Partial<Record<CspDirective, string>> = {
  "default-src": "'self'",
  "script-src": "'self'",
  "style-src": "'self' 'unsafe-inline'",
  "img-src": "'self' data:",
  "font-src": "'self'",
  "connect-src": "'self'",
  "frame-ancestors": "'self'",
  "form-action": "'self'",
  "base-uri": "'self'",
};

/**
 * Generates a cryptographically secure nonce for CSP.
 *
 * @returns A base64-encoded random nonce
 *
 * @example
 * ```typescript
 * const nonce = generateNonce();
 * // Use in HTML: <script nonce="${nonce}">...</script>
 * ```
 */
export const generateNonce = (): string => {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array));
};

/**
 * Builds a CSP header value from directives.
 */
const buildCspHeader = (
  directives: Partial<Record<CspDirective, string | string[]>>,
): string => {
  return Object.entries(directives)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key} ${value.join(" ")}`;
      }
      return `${key} ${value}`;
    })
    .join("; ");
};

/**
 * Creates a Content Security Policy middleware.
 *
 * @param options - CSP configuration options
 * @returns A middleware function that adds CSP headers
 *
 * @example
 * ```typescript
 * // Use default secure policy
 * const cspMiddleware = csp();
 *
 * // Custom policy
 * const cspMiddleware = csp({
 *   directives: {
 *     "default-src": "'self'",
 *     "script-src": ["'self'", "https://cdn.example.com"],
 *     "style-src": ["'self'", "'unsafe-inline'"],
 *     "img-src": ["'self'", "data:", "https:"],
 *   },
 * });
 *
 * // Report-only mode for testing
 * const cspMiddleware = csp({
 *   reportOnly: true,
 *   directives: {
 *     "report-uri": "/csp-report",
 *   },
 * });
 *
 * // With nonce for inline scripts
 * const cspMiddleware = csp({ useNonce: true });
 * ```
 */
export const csp = (options: CspOptions = {}): MiddlewareFn => {
  return async (
    _req: Request,
    next: () => Response | Promise<Response>,
  ): Promise<Response> => {
    const nonce = options.useNonce ? generateNonce() : undefined;

    // Merge default directives with custom ones
    const directives: Partial<Record<CspDirective, string | string[]>> = {
      ...DEFAULT_DIRECTIVES,
      ...options.directives,
    };

    // Add nonce to script-src if enabled
    if (nonce) {
      const scriptSrc = directives["script-src"];
      if (Array.isArray(scriptSrc)) {
        directives["script-src"] = [...scriptSrc, `'nonce-${nonce}'`];
      } else if (scriptSrc) {
        directives["script-src"] = `${scriptSrc} 'nonce-${nonce}'`;
      } else {
        directives["script-src"] = `'self' 'nonce-${nonce}'`;
      }
    }

    const cspValue = buildCspHeader(directives);

    const response = await next();
    const headers = new Headers(response.headers);

    const headerName = options.reportOnly
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy";

    headers.set(headerName, cspValue);

    // Store nonce in a custom header for access by the application
    if (nonce) {
      headers.set("X-CSP-Nonce", nonce);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
};

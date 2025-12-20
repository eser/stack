// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Configuration options for CSRF middleware.
 */
export interface CsrfOptions {
  /**
   * Name of the cookie that stores the CSRF token.
   * Defaults to "csrf_token".
   */
  cookie?: string;

  /**
   * Name of the header that should contain the CSRF token.
   * Defaults to "X-CSRF-Token".
   */
  header?: string;

  /**
   * Name of the form field that can contain the CSRF token.
   * Defaults to "_csrf".
   */
  formField?: string;

  /**
   * HTTP methods that require CSRF validation.
   * Defaults to ["POST", "PUT", "PATCH", "DELETE"].
   */
  methods?: string[];

  /**
   * Paths to exclude from CSRF validation.
   * Supports exact matches and patterns ending with *.
   */
  excludePaths?: string[];

  /**
   * Cookie options for the CSRF token cookie.
   */
  cookieOptions?: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
    path?: string;
    maxAge?: number;
  };
}

const DEFAULT_OPTIONS: Required<Omit<CsrfOptions, "excludePaths">> = {
  cookie: "csrf_token",
  header: "X-CSRF-Token",
  formField: "_csrf",
  methods: ["POST", "PUT", "PATCH", "DELETE"],
  cookieOptions: {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
    maxAge: 86400, // 24 hours
  },
};

/**
 * Generates a cryptographically secure CSRF token.
 *
 * @returns A hex-encoded random token
 *
 * @example
 * ```typescript
 * const token = generateToken();
 * // token = "a1b2c3d4e5f6..." (64 hex characters)
 * ```
 */
export const generateToken = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
};

/**
 * Parses cookies from a Cookie header value.
 */
const parseCookies = (cookieHeader: string): Map<string, string> => {
  const cookies = new Map<string, string>();
  if (!cookieHeader) return cookies;

  for (const part of cookieHeader.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name) {
      cookies.set(name, valueParts.join("="));
    }
  }

  return cookies;
};

/**
 * Builds a Set-Cookie header value.
 */
const buildSetCookie = (
  name: string,
  value: string,
  options: Required<CsrfOptions>["cookieOptions"],
): string => {
  const parts = [`${name}=${value}`];

  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.maxAge) parts.push(`Max-Age=${options.maxAge}`);

  return parts.join("; ");
};

/**
 * Checks if a path should be excluded from CSRF validation.
 */
const isPathExcluded = (
  path: string,
  excludePaths: string[] | undefined,
): boolean => {
  if (!excludePaths?.length) return false;

  for (const excludePath of excludePaths) {
    if (excludePath.endsWith("*")) {
      const prefix = excludePath.slice(0, -1);
      if (path.startsWith(prefix)) return true;
    } else if (path === excludePath) {
      return true;
    }
  }

  return false;
};

/**
 * Middleware function type.
 */
export type MiddlewareFn = (
  req: Request,
  next: () => Response | Promise<Response>,
) => Response | Promise<Response>;

/**
 * Creates a CSRF protection middleware using the double-submit cookie pattern.
 *
 * The middleware:
 * 1. Sets a CSRF token cookie on every response
 * 2. Validates that the token in the header/form matches the cookie for unsafe methods
 * 3. Returns 403 if validation fails
 *
 * @param options - CSRF configuration options
 * @returns A middleware function that provides CSRF protection
 *
 * @example
 * ```typescript
 * // Basic usage
 * const csrfMiddleware = csrf();
 *
 * // Custom configuration
 * const csrfMiddleware = csrf({
 *   cookie: "my_csrf_token",
 *   header: "X-My-CSRF-Token",
 *   excludePaths: ["/api/webhooks/*", "/health"],
 * });
 *
 * // Client-side usage:
 * // 1. Read token from cookie
 * // 2. Include in request header: X-CSRF-Token: <token>
 * ```
 */
export const csrf = (options: CsrfOptions = {}): MiddlewareFn => {
  const opts = {
    ...DEFAULT_OPTIONS,
    ...options,
    cookieOptions: {
      ...DEFAULT_OPTIONS.cookieOptions,
      ...options.cookieOptions,
    },
  };

  return async (
    req: Request,
    next: () => Response | Promise<Response>,
  ): Promise<Response> => {
    const url = new URL(req.url);
    const path = url.pathname;

    // Check if path is excluded
    if (isPathExcluded(path, options.excludePaths)) {
      return next();
    }

    // Parse existing cookies
    const cookieHeader = req.headers.get("Cookie") ?? "";
    const cookies = parseCookies(cookieHeader);
    const cookieToken = cookies.get(opts.cookie);

    // For safe methods, just ensure a token exists
    if (!opts.methods.includes(req.method)) {
      const response = await next();

      // Set token cookie if not present
      if (!cookieToken) {
        const newToken = generateToken();
        const headers = new Headers(response.headers);
        headers.append(
          "Set-Cookie",
          buildSetCookie(opts.cookie, newToken, opts.cookieOptions),
        );

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }

      return response;
    }

    // For unsafe methods, validate the token
    const headerToken = req.headers.get(opts.header);

    // Try to get token from form data if not in header
    let formToken: string | undefined;
    if (!headerToken) {
      const contentType = req.headers.get("Content-Type");
      if (contentType?.includes("application/x-www-form-urlencoded")) {
        try {
          const body = await req.clone().formData();
          formToken = body.get(opts.formField)?.toString();
        } catch {
          // Ignore form parsing errors
        }
      }
    }

    const submittedToken = headerToken ?? formToken;

    // Validate token
    if (!cookieToken || !submittedToken || cookieToken !== submittedToken) {
      return new Response(
        JSON.stringify({
          error: "CSRF token mismatch",
          message:
            "The CSRF token in the request does not match the expected token",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Token is valid, proceed with request
    const response = await next();

    // Rotate token after successful validation
    const newToken = generateToken();
    const headers = new Headers(response.headers);
    headers.append(
      "Set-Cookie",
      buildSetCookie(opts.cookie, newToken, opts.cookieOptions),
    );

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
};

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Typed HTTP error hierarchy for @eserstack/httpclient.
 *
 * Replaces the duplicated status-code classification logic in:
 * - @eserstack/ai/errors.ts (classifyStatusCode / classifyAndWrap)
 * - @eserstack/posts adapters (extractError helpers)
 *
 * After migration, those packages import from here instead.
 *
 * @module
 */

// =============================================================================
// Error Options
// =============================================================================

export interface HttpClientErrorOptions {
  statusCode?: number;
  request?: Request;
  response?: Response;
  body?: unknown;
  retryAfter?: number;
  cause?: Error;
}

// =============================================================================
// Error Hierarchy
// =============================================================================

export class HttpClientError extends Error {
  readonly statusCode: number | null;
  readonly request: Request | null;
  readonly response: Response | null;
  readonly body: unknown;
  readonly retryAfter: number | null;

  constructor(message: string, options?: HttpClientErrorOptions) {
    super(message, { cause: options?.cause });
    this.name = "HttpClientError";
    this.statusCode = options?.statusCode ?? null;
    this.request = options?.request ?? null;
    this.response = options?.response ?? null;
    this.body = options?.body;
    this.retryAfter = options?.retryAfter ?? null;
  }
}

/** Non-2xx HTTP response (generic). */
export class HttpResponseError extends HttpClientError {
  readonly code = "RESPONSE_ERROR" as const;

  constructor(message: string, options?: HttpClientErrorOptions) {
    super(message, options);
    this.name = "HttpResponseError";
  }
}

/** Request timed out via AbortSignal.timeout(). */
export class HttpTimeoutError extends HttpClientError {
  readonly code = "TIMEOUT" as const;

  constructor(message: string, options?: HttpClientErrorOptions) {
    super(message, options);
    this.name = "HttpTimeoutError";
  }
}

/** Request aborted via a user-supplied AbortSignal. */
export class HttpAbortError extends HttpClientError {
  readonly code = "ABORT_ERROR" as const;

  constructor(message: string, options?: HttpClientErrorOptions) {
    super(message, options);
    this.name = "HttpAbortError";
  }
}

/** HTTP 429 Too Many Requests. */
export class HttpRateLimitError extends HttpClientError {
  readonly code = "RATE_LIMITED" as const;

  constructor(message: string, options?: HttpClientErrorOptions) {
    super(message, options);
    this.name = "HttpRateLimitError";
  }
}

/** DNS lookup or TCP connection failure (no HTTP response received). */
export class HttpNetworkError extends HttpClientError {
  readonly code = "NETWORK_ERROR" as const;

  constructor(message: string, options?: HttpClientErrorOptions) {
    super(message, options);
    this.name = "HttpNetworkError";
  }
}

// =============================================================================
// Classification Utilities
// =============================================================================

/**
 * Maps an HTTP status code to the appropriate error class.
 * Returns null for status codes that don't have a dedicated type.
 *
 * Replaces @eserstack/ai/errors.ts:classifyStatusCode with HTTP-generic semantics
 * (no AI-specific codes, no provider field).
 */
export const classifyHttpStatus = (
  statusCode: number,
): typeof HttpClientError | null => {
  if (statusCode === 429) return HttpRateLimitError;
  if (statusCode >= 500 && statusCode <= 599) return HttpResponseError;
  if (statusCode === 408) return HttpResponseError;
  return null;
};

/**
 * Converts a native Error (or existing HttpClientError) to the most specific
 * HttpClientError subclass. Inspects error.name for timeout/abort signals.
 */
export const classifyError = (
  error: Error,
  response?: Response,
): HttpClientError => {
  if (error instanceof HttpClientError) return error;

  // DOMException: TimeoutError from AbortSignal.timeout()
  if (error.name === "TimeoutError") {
    return new HttpTimeoutError(error.message, {
      cause: error,
      ...(response !== undefined && {
        statusCode: response.status,
        response,
      }),
    });
  }

  // DOMException: AbortError from user-supplied AbortSignal
  if (error.name === "AbortError") {
    return new HttpAbortError(error.message, { cause: error });
  }

  if (response !== undefined) {
    const ErrorClass = classifyHttpStatus(response.status);
    const opts: HttpClientErrorOptions = {
      statusCode: response.status,
      response,
      cause: error,
    };
    return ErrorClass !== null
      ? new ErrorClass(error.message, opts)
      : new HttpResponseError(error.message, opts);
  }

  // Network-level failures (no response)
  if (
    error.message.includes("Failed to fetch") ||
    error.message.includes("fetch failed") ||
    error.message.includes("ECONNREFUSED") ||
    error.message.includes("ENOTFOUND")
  ) {
    return new HttpNetworkError(error.message, { cause: error });
  }

  return new HttpClientError(error.message, { cause: error });
};

/**
 * Wrap a native Error with a classified HttpClientError based on status code.
 * Replaces @eserstack/ai/errors.ts:classifyAndWrap — no provider field here.
 */
export const classifyAndWrap = (
  statusCode: number,
  original: Error,
  options?: Omit<HttpClientErrorOptions, "statusCode" | "cause">,
): HttpClientError => {
  const ErrorClass = classifyHttpStatus(statusCode) ?? HttpResponseError;
  return new ErrorClass(original.message, {
    ...options,
    statusCode,
    cause: original,
  });
};

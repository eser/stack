// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Public type definitions for @eserstack/httpclient.
 *
 * Provides compatibility with @eserstack/functions patterns:
 * - Result<T,E> re-exported for consumer convenience
 * - RetryConfig shape mirrors @eserstack/functions/resources.ts retryWithBackoff options
 *
 * @module
 */

export type { Fail, Ok, Result } from "@eserstack/primitives/results";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";

/** Rate-limit metadata extracted from response headers. */
export interface RateLimitInfo {
  remaining?: number;
  limit?: number;
  resetAt?: number;
  retryAfterSeconds?: number;
}

/** Structured response returned by all HttpClient methods. */
export interface HttpResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Headers;
  request: Request;
  raw: Response;
  retries: number;
  rateLimit?: RateLimitInfo;
}

/**
 * Response from a streaming request.
 * Body is NOT consumed — the caller owns the ReadableStream lifecycle.
 *
 * Response interceptors do NOT run on stream responses because they expect a
 * typed `HttpResponse<T>` with parsed `data`, which streaming doesn't have.
 * Request interceptors run normally.
 */
export interface HttpStreamResponse {
  /** Raw body stream — caller reads and closes this. */
  body: ReadableStream<Uint8Array>;
  /** HTTP status code. */
  status: number;
  /** HTTP status text. */
  statusText: string;
  /** Response headers. */
  headers: Headers;
  /** The Request object that was sent (after request interceptors). */
  request: Request;
  /** Original Response object (escape hatch). */
  raw: Response;
  /** Number of retries attempted before the stream connected. */
  retries: number;
  /** Rate-limit metadata extracted from response headers. */
  rateLimit?: RateLimitInfo;
}

/** Named request interceptor — transforms a Request before sending. */
export type RequestInterceptor = {
  name?: string;
  intercept: (request: Request) => Request | Promise<Request>;
};

/** Named response interceptor — transforms an HttpResponse after receiving. */
export type ResponseInterceptor = {
  name?: string;
  intercept: <T>(
    response: HttpResponse<T>,
  ) => HttpResponse<T> | Promise<HttpResponse<T>>;
};

/** Interceptor collections for client configuration. */
export interface Interceptors {
  request?: ReadonlyArray<RequestInterceptor>;
  response?: ReadonlyArray<ResponseInterceptor>;
}

/**
 * Retry configuration.
 * Shape mirrors @eserstack/functions/resources.ts retryWithBackoff options
 * for consistency across the monorepo.
 */
export interface RetryConfig {
  /** Maximum number of attempts (default: 3). Matches @eserstack/functions. */
  maxAttempts?: number;
  /** Initial backoff delay in ms (default: 1000). Matches @eserstack/functions. */
  initialDelay?: number;
  /** Maximum backoff delay in ms (default: 30_000). Matches @eserstack/functions. */
  maxDelay?: number;
  /** Backoff multiplication factor (default: 2). Matches @eserstack/functions. */
  factor?: number;
  /** Add randomness to delays to avoid thundering herd (default: true). */
  jitter?: boolean;
  /** HTTP status codes that trigger a retry (default: [408, 429, 500, 502, 503, 504]). */
  retryableStatuses?: readonly number[];
  /** Honour the Retry-After response header for 429 responses (default: true). */
  respectRetryAfter?: boolean;
}

/** Client-level configuration. */
export interface HttpClientConfig {
  baseUrl?: string;
  headers?: Record<string, string>;
  /** Request timeout in ms (default: 30_000). */
  timeout?: number;
  /** Retry policy — pass false to disable retry entirely. */
  retry?: RetryConfig | false;
  interceptors?: Interceptors;
  /** Inject a custom fetch for testing. */
  fetchFn?: typeof fetch;
  /** Inject a custom delay function to control timing in tests. */
  _delayFn?: (ms: number) => Promise<void>;
}

/** Per-request overrides. */
export interface RequestOptions {
  headers?: Record<string, string>;
  /**
   * Request body. Auto-serialization rules:
   * - Plain object / array → `JSON.stringify(body)`, sets `Content-Type: application/json`
   *   (header is NOT overwritten if already set by the caller)
   * - `string`, `ArrayBuffer`, `ArrayBufferView`, `Blob`, `FormData`,
   *   `URLSearchParams`, `ReadableStream` → forwarded as-is to `fetch()`
   * - `undefined` → no body sent
   */
  body?: BodyInit | Record<string, unknown>;
  params?: Record<string, string>;
  timeout?: number;
  retry?: RetryConfig | false;
  signal?: AbortSignal;
}

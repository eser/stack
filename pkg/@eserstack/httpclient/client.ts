// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * HttpClient — resilient HTTP client with timeout, retry, rate-limit handling,
 * and request/response interceptors.
 *
 * Provides two APIs:
 * - Throw-style: `client.get<T>(url)` — throws HttpClientError on failure
 * - Result-style: `client.getResult<T>(url)` — returns Result<HttpResponse<T>, HttpClientError>
 *   for @eserstack/functions do-notation compatibility
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import type * as types from "./types.ts";
import * as errors from "./errors.ts";
import * as interceptors from "./interceptors.ts";
import * as goClientModule from "./go-client.ts";

// =============================================================================
// Defaults
// =============================================================================

const DEFAULT_TIMEOUT = 30_000;

const DEFAULT_RETRY: Required<types.RetryConfig> = {
  maxAttempts: 3,
  initialDelay: 1_000,
  maxDelay: 30_000,
  factor: 2,
  jitter: true,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
  respectRetryAfter: true,
};

const defaultDelayFn = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// =============================================================================
// Internal Helpers
// =============================================================================

const resolveUrl = (baseUrl: string | undefined, path: string): string => {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  if (baseUrl !== undefined && baseUrl !== "") {
    const base = baseUrl.replace(/\/$/, "");
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${base}${normalizedPath}`;
  }
  return path;
};

export const parseRetryAfter = (header: string | null): number | null => {
  const ms = parseRetryAfterMs(header);
  return ms !== null ? ms / 1_000 : null;
};

const parseRetryAfterMs = (header: string | null): number | null => {
  if (header === null) return null;
  const seconds = Number(header);
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return Math.round(seconds * 1_000);
  }
  const date = new Date(header);
  if (!Number.isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }
  return null;
};

export const extractRateLimitInfo = (
  hdrs: Headers,
): types.RateLimitInfo | undefined => {
  const remaining = hdrs.get("X-RateLimit-Remaining") ??
    hdrs.get("x-rate-limit-remaining");
  const limit = hdrs.get("X-RateLimit-Limit") ?? hdrs.get("x-rate-limit-limit");
  const reset = hdrs.get("X-RateLimit-Reset") ?? hdrs.get("x-rate-limit-reset");
  const retryAfterHeader = hdrs.get("Retry-After");

  if (
    remaining === null && limit === null && reset === null &&
    retryAfterHeader === null
  ) {
    return undefined;
  }

  const retryAfterMs = parseRetryAfterMs(retryAfterHeader);

  return {
    ...(remaining !== null && { remaining: Number(remaining) }),
    ...(limit !== null && { limit: Number(limit) }),
    ...(reset !== null && { resetAt: Number(reset) }),
    ...(retryAfterMs !== null && { retryAfterSeconds: retryAfterMs / 1_000 }),
  };
};

const calcBackoffDelay = (
  attempt: number,
  cfg: Required<types.RetryConfig>,
): number => {
  let delay = cfg.initialDelay * Math.pow(cfg.factor, attempt);
  delay = Math.min(delay, cfg.maxDelay);
  if (cfg.jitter) {
    delay = delay * (0.5 + Math.random() * 0.5);
  }
  return Math.round(delay);
};

const resolveRetryConfig = (
  clientRetry: types.RetryConfig | false | undefined,
  requestRetry: types.RetryConfig | false | undefined,
): Required<types.RetryConfig> | false => {
  if (clientRetry === false || requestRetry === false) return false;
  if (clientRetry === undefined && requestRetry === undefined) {
    return DEFAULT_RETRY;
  }
  return {
    ...DEFAULT_RETRY,
    ...(clientRetry ?? {}),
    ...(requestRetry ?? {}),
  };
};

const extractErrorBody = async (raw: Response): Promise<unknown> => {
  try {
    return await raw.clone().json();
  } catch {
    return await raw.clone().text().catch(() => undefined);
  }
};

const errorMessageFromBody = (body: unknown): string | null => {
  if (typeof body === "object" && body !== null) {
    const b = body as Record<string, unknown>;
    const msg = b["error"] ?? b["message"] ?? b["detail"] ?? b["title"];
    if (msg !== undefined) return String(msg);
  }
  return null;
};

// =============================================================================
// HttpClient
// =============================================================================

export class HttpClient {
  private readonly config: types.HttpClientConfig;
  #goClient: goClientModule.GoHttpClient | null = null;
  #goClientInit: Promise<void> | null = null;

  constructor(config?: types.HttpClientConfig) {
    this.config = config ?? {};
  }

  /** Return a new client with merged configuration (immutable). */
  withDefaults(overrides: Partial<types.HttpClientConfig>): HttpClient {
    return new HttpClient({
      ...this.config,
      ...overrides,
      headers: {
        ...(this.config.headers ?? {}),
        ...(overrides.headers ?? {}),
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Throw-style API
  // ---------------------------------------------------------------------------

  async request<T>(
    method: types.HttpMethod,
    url: string,
    options?: types.RequestOptions,
  ): Promise<types.HttpResponse<T>> {
    await this.#ensureGoClient();
    if (this.#goClient !== null) {
      return this.#executeViaGoClient<T>(method, url, options);
    }
    return this._execute<T>(method, url, options);
  }

  get<T>(
    url: string,
    options?: types.RequestOptions,
  ): Promise<types.HttpResponse<T>> {
    return this._execute<T>("GET", url, options);
  }

  post<T>(
    url: string,
    options?: types.RequestOptions,
  ): Promise<types.HttpResponse<T>> {
    return this._execute<T>("POST", url, options);
  }

  put<T>(
    url: string,
    options?: types.RequestOptions,
  ): Promise<types.HttpResponse<T>> {
    return this._execute<T>("PUT", url, options);
  }

  patch<T>(
    url: string,
    options?: types.RequestOptions,
  ): Promise<types.HttpResponse<T>> {
    return this._execute<T>("PATCH", url, options);
  }

  delete<T>(
    url: string,
    options?: types.RequestOptions,
  ): Promise<types.HttpResponse<T>> {
    return this._execute<T>("DELETE", url, options);
  }

  // ---------------------------------------------------------------------------
  // Streaming throw-style API
  // ---------------------------------------------------------------------------

  /**
   * Make a request and return the response body as a ReadableStream.
   * Throws HttpClientError on non-2xx status (after retries).
   *
   * Key differences from `request<T>()`:
   * - Body is NOT consumed or parsed — caller owns the stream lifecycle.
   * - Retry applies to connection establishment only, not stream reading.
   * - Timeout applies to the initial connection, not stream duration.
   * - Response interceptors do NOT run (they require a parsed `data` field).
   */
  async requestStream(
    method: types.HttpMethod,
    url: string,
    options?: types.RequestOptions,
  ): Promise<types.HttpStreamResponse> {
    await this.#ensureGoClient();
    if (this.#goClient !== null) {
      return this.#executeStreamViaGoClient(method, url, options);
    }
    return this._executeStream(method, url, options);
  }

  /**
   * POST a request and return the response body as a ReadableStream.
   * The only streaming convenience method provided — it is the only HTTP verb
   * used for streaming in practice (SSE, NDJSON).
   */
  postStream(
    url: string,
    options?: types.RequestOptions,
  ): Promise<types.HttpStreamResponse> {
    return this.requestStream("POST", url, options);
  }

  // ---------------------------------------------------------------------------
  // Result-style API (@eserstack/functions do-notation compatibility)
  // ---------------------------------------------------------------------------

  requestResult<T>(
    method: types.HttpMethod,
    url: string,
    options?: types.RequestOptions,
  ): Promise<
    results.Result<types.HttpResponse<T>, errors.HttpClientError>
  > {
    return results.fromPromise(
      this._execute<T>(method, url, options),
      toHttpClientError,
    );
  }

  getResult<T>(
    url: string,
    options?: types.RequestOptions,
  ): Promise<results.Result<types.HttpResponse<T>, errors.HttpClientError>> {
    return results.fromPromise(
      this._execute<T>("GET", url, options),
      toHttpClientError,
    );
  }

  postResult<T>(
    url: string,
    options?: types.RequestOptions,
  ): Promise<results.Result<types.HttpResponse<T>, errors.HttpClientError>> {
    return results.fromPromise(
      this._execute<T>("POST", url, options),
      toHttpClientError,
    );
  }

  putResult<T>(
    url: string,
    options?: types.RequestOptions,
  ): Promise<results.Result<types.HttpResponse<T>, errors.HttpClientError>> {
    return results.fromPromise(
      this._execute<T>("PUT", url, options),
      toHttpClientError,
    );
  }

  patchResult<T>(
    url: string,
    options?: types.RequestOptions,
  ): Promise<results.Result<types.HttpResponse<T>, errors.HttpClientError>> {
    return results.fromPromise(
      this._execute<T>("PATCH", url, options),
      toHttpClientError,
    );
  }

  deleteResult<T>(
    url: string,
    options?: types.RequestOptions,
  ): Promise<results.Result<types.HttpResponse<T>, errors.HttpClientError>> {
    return results.fromPromise(
      this._execute<T>("DELETE", url, options),
      toHttpClientError,
    );
  }

  // ---------------------------------------------------------------------------
  // Streaming Result-style API
  // ---------------------------------------------------------------------------

  requestStreamResult(
    method: types.HttpMethod,
    url: string,
    options?: types.RequestOptions,
  ): Promise<results.Result<types.HttpStreamResponse, errors.HttpClientError>> {
    return results.fromPromise(
      this._executeStream(method, url, options),
      toHttpClientError,
    );
  }

  postStreamResult(
    url: string,
    options?: types.RequestOptions,
  ): Promise<results.Result<types.HttpStreamResponse, errors.HttpClientError>> {
    return results.fromPromise(
      this._executeStream("POST", url, options),
      toHttpClientError,
    );
  }

  // ---------------------------------------------------------------------------
  // Core implementation
  // ---------------------------------------------------------------------------

  /**
   * Shared retry/timeout/error-handling core.
   * Handles URL building, header merging, body serialization, retry loop,
   * timeout via AbortSignal, rate-limit parsing, and error classification.
   *
   * The `onSuccess` callback is invoked once a 2xx response is received.
   * It receives the raw Response, the sent Request, the retry count, and any
   * extracted rate-limit info. Each public method variant supplies its own
   * onSuccess: _execute parses JSON and runs response interceptors;
   * _executeStream returns the body stream directly.
   *
   * This is the single source of truth for retry/timeout behavior — both
   * _execute and _executeStream delegate entirely to this method.
   */
  private async _executeFetch<T>(
    method: types.HttpMethod,
    url: string,
    options: types.RequestOptions | undefined,
    onSuccess: (
      raw: Response,
      sentRequest: Request,
      retries: number,
      rateLimit: types.RateLimitInfo | undefined,
    ) => Promise<T>,
  ): Promise<T> {
    const fetchFn = this.config.fetchFn ?? fetch;
    const delayFn = this.config._delayFn ?? defaultDelayFn;

    // Build URL
    const resolvedUrl = resolveUrl(this.config.baseUrl, url);
    const fullUrl = new URL(resolvedUrl);
    if (options?.params !== undefined) {
      for (const [key, value] of Object.entries(options.params)) {
        fullUrl.searchParams.set(key, value);
      }
    }

    // Merge headers
    const headers: Record<string, string> = {
      ...(this.config.headers ?? {}),
      ...(options?.headers ?? {}),
    };

    // Handle body
    let body: BodyInit | undefined;
    const bodyValue = options?.body;
    if (bodyValue !== undefined) {
      if (
        typeof bodyValue === "string" ||
        bodyValue instanceof ArrayBuffer ||
        ArrayBuffer.isView(bodyValue) ||
        bodyValue instanceof Blob ||
        bodyValue instanceof FormData ||
        bodyValue instanceof URLSearchParams ||
        bodyValue instanceof ReadableStream
      ) {
        body = bodyValue as BodyInit;
      } else if (typeof bodyValue === "object" && bodyValue !== null) {
        body = JSON.stringify(bodyValue);
        if (headers["Content-Type"] === undefined) {
          headers["Content-Type"] = "application/json";
        }
      }
    }

    // Resolve retry and timeout config
    const retryCfg = resolveRetryConfig(this.config.retry, options?.retry);
    const timeout = options?.timeout ?? this.config.timeout ?? DEFAULT_TIMEOUT;
    const maxAttempts = retryCfg === false
      ? 1
      : (retryCfg.maxAttempts ?? DEFAULT_RETRY.maxAttempts);
    const requestInterceptors = this.config.interceptors?.request ?? [];

    let retries = 0;
    let lastError: errors.HttpClientError | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        retries++;
      }

      let raw: Response;
      let sentRequest: Request;

      try {
        // Build combined abort signal
        const userSignal = options?.signal;
        const timeoutSignal = AbortSignal.timeout(timeout);
        const signal = userSignal !== undefined
          ? AbortSignal.any([timeoutSignal, userSignal])
          : timeoutSignal;

        const initRequest = new Request(fullUrl.toString(), {
          method,
          headers,
          body,
          signal,
        });

        // deno-lint-ignore no-await-in-loop
        sentRequest = await interceptors.applyRequestInterceptors(
          initRequest,
          requestInterceptors,
        );

        // deno-lint-ignore no-await-in-loop
        raw = await fetchFn(sentRequest);
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        const classified = errors.classifyError(e);

        // Never retry timeout or user abort
        if (
          classified instanceof errors.HttpTimeoutError ||
          classified instanceof errors.HttpAbortError
        ) {
          throw classified;
        }

        lastError = classified;

        if (attempt < maxAttempts - 1) {
          const delay = calcBackoffDelay(
            attempt,
            retryCfg === false ? DEFAULT_RETRY : retryCfg,
          );
          // deno-lint-ignore no-await-in-loop
          await delayFn(delay);
        }
        continue;
      }

      // Successful connection — check HTTP status
      const rateLimit = extractRateLimitInfo(raw.headers);

      if (!raw.ok) {
        // deno-lint-ignore no-await-in-loop
        const errorBody = await extractErrorBody(raw);
        const statusMsg = errorMessageFromBody(errorBody) ??
          `HTTP ${raw.status}`;
        const retryAfterMs = rateLimit !== undefined
          ? parseRetryAfterMs(raw.headers.get("Retry-After"))
          : null;

        const httpError = raw.status === 429
          ? new errors.HttpRateLimitError(statusMsg, {
            statusCode: raw.status,
            response: raw,
            body: errorBody,
            ...(retryAfterMs !== null && {
              retryAfter: retryAfterMs / 1_000,
            }),
          })
          : new errors.HttpResponseError(statusMsg, {
            statusCode: raw.status,
            response: raw,
            body: errorBody,
          });

        const retryableStatuses = retryCfg !== false
          ? retryCfg.retryableStatuses
          : [];

        if (
          retryableStatuses.includes(raw.status) && attempt < maxAttempts - 1
        ) {
          lastError = httpError;

          // Honour Retry-After for 429
          if (
            raw.status === 429 && retryCfg !== false &&
            retryCfg.respectRetryAfter && retryAfterMs !== null
          ) {
            // deno-lint-ignore no-await-in-loop
            await delayFn(retryAfterMs);
            continue;
          }

          const delay = calcBackoffDelay(
            attempt,
            retryCfg === false ? DEFAULT_RETRY : retryCfg,
          );
          // deno-lint-ignore no-await-in-loop
          await delayFn(delay);
          continue;
        }

        throw httpError;
      }

      // 2xx — delegate to the variant-specific success handler
      // deno-lint-ignore no-await-in-loop
      return await onSuccess(raw, sentRequest, retries, rateLimit);
    }

    throw lastError ??
      new errors.HttpClientError(
        `Request failed after ${maxAttempts} attempt(s)`,
      );
  }

  /** JSON-parsing variant — parses body, builds HttpResponse<T>, runs response interceptors. */
  private _execute<T>(
    method: types.HttpMethod,
    url: string,
    options?: types.RequestOptions,
  ): Promise<types.HttpResponse<T>> {
    const responseInterceptors = this.config.interceptors?.response ?? [];
    return this._executeFetch<types.HttpResponse<T>>(
      method,
      url,
      options,
      async (raw, sentRequest, retries, rateLimit) => {
        // Parse response body
        let data: T;
        if (
          raw.status === 204 || raw.status === 304 ||
          raw.headers.get("Content-Length") === "0"
        ) {
          data = undefined as unknown as T;
        } else {
          const contentType = raw.headers.get("Content-Type") ?? "";
          if (contentType.includes("application/json")) {
            data = await raw.json() as T;
          } else {
            const text = await raw.text();
            try {
              data = JSON.parse(text) as T;
            } catch {
              data = text as unknown as T;
            }
          }
        }

        let response: types.HttpResponse<T> = {
          data,
          status: raw.status,
          statusText: raw.statusText,
          headers: raw.headers,
          request: sentRequest,
          raw,
          retries,
          ...(rateLimit !== undefined && { rateLimit }),
        };

        response = await interceptors.applyResponseInterceptors(
          response,
          responseInterceptors,
        );

        return response;
      },
    );
  }

  /**
   * Streaming variant — returns body as ReadableStream without consuming it.
   * Response interceptors do NOT run (they require a parsed `data` field).
   * Timeout applies to connection establishment only, not stream reading.
   */
  private _executeStream(
    method: types.HttpMethod,
    url: string,
    options?: types.RequestOptions,
  ): Promise<types.HttpStreamResponse> {
    return this._executeFetch<types.HttpStreamResponse>(
      method,
      url,
      options,
      (raw, sentRequest, retries, rateLimit) => {
        if (raw.body === null) {
          return Promise.reject(
            new errors.HttpNetworkError(
              "Response body is null — server sent no body for a streaming request",
            ),
          );
        }

        return Promise.resolve({
          body: raw.body,
          status: raw.status,
          statusText: raw.statusText,
          headers: raw.headers,
          request: sentRequest,
          raw,
          retries,
          ...(rateLimit !== undefined && { rateLimit }),
        });
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Go FFI bridge (private)
  // ---------------------------------------------------------------------------

  #classifyGoHttpError(err: unknown): errors.HttpClientError {
    if (err instanceof goClientModule.GoHttpError) {
      if (err.status > 0) {
        let body: unknown = err.body;
        try { body = JSON.parse(err.body); } catch { /* keep as string */ }
        const retryAfterMs = parseRetryAfterMs(
          err.headers["Retry-After"] ?? err.headers["retry-after"] ?? null,
        );
        const opts: errors.HttpClientErrorOptions = {
          statusCode: err.status,
          body,
          ...(retryAfterMs !== null && { retryAfter: retryAfterMs / 1_000 }),
        };
        if (err.status === 429) return new errors.HttpRateLimitError(`HTTP ${err.status}`, opts);
        return new errors.HttpResponseError(`HTTP ${err.status}`, opts);
      }
      return new errors.HttpNetworkError(err.message, { cause: err });
    }
    const e = err instanceof Error ? err : new Error(String(err));
    return errors.classifyError(e);
  }

  async #ensureGoClient(): Promise<void> {
    // Custom fetchFn signals test/mock mode — always use the TS path.
    if (this.config.fetchFn !== undefined) {
      return;
    }
    if (this.#goClientInit !== null) {
      return this.#goClientInit;
    }
    this.#goClientInit = goClientModule.createGoHttpClient({
      baseUrl: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: this.config.headers,
    }).then(
      (client) => { this.#goClient = client; },
      () => { /* native library unavailable — #goClient stays null */ },
    );
    return this.#goClientInit;
  }

  async #executeViaGoClient<T>(
    method: types.HttpMethod,
    url: string,
    options?: types.RequestOptions,
  ): Promise<types.HttpResponse<T>> {
    const resolvedUrl = resolveUrl(this.config.baseUrl, url);
    const headers: Record<string, string> = {
      ...(this.config.headers ?? {}),
      ...(options?.headers ?? {}),
    };
    const bodyValue = options?.body;
    let bodyStr: string | undefined;
    if (bodyValue !== undefined) {
      if (typeof bodyValue === "string") {
        bodyStr = bodyValue;
      } else if (
        typeof bodyValue === "object" && bodyValue !== null &&
        !(bodyValue instanceof ReadableStream)
      ) {
        bodyStr = JSON.stringify(bodyValue);
        if (headers["Content-Type"] === undefined) {
          headers["Content-Type"] = "application/json";
        }
      }
    }

    const goReq: goClientModule.GoHttpRequest = {
      method: method as goClientModule.GoHttpMethod,
      url: resolvedUrl,
      headers,
      ...(bodyStr !== undefined && { body: bodyStr }),
      ...(options?.timeout !== undefined && { timeout: options.timeout }),
    };

    let resp: Awaited<ReturnType<goClientModule.GoHttpClient["request"]>>;
    try {
      resp = await this.#goClient!.request(goReq);
    } catch (err) {
      throw this.#classifyGoHttpError(err);
    }

    const contentType = resp.headers["content-type"] ??
      resp.headers["Content-Type"] ?? "";
    let data: T;
    if (contentType.includes("application/json")) {
      data = JSON.parse(resp.body) as T;
    } else {
      try {
        data = JSON.parse(resp.body) as T;
      } catch {
        data = resp.body as unknown as T;
      }
    }

    const raw = new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: resp.headers,
    });
    const rateLimit = extractRateLimitInfo(raw.headers);

    return {
      data,
      status: resp.status,
      statusText: resp.statusText,
      headers: raw.headers,
      request: new Request(resolvedUrl, { method, headers }),
      raw,
      retries: resp.retries,
      ...(rateLimit !== undefined && { rateLimit }),
    };
  }

  async #executeStreamViaGoClient(
    method: types.HttpMethod,
    url: string,
    options?: types.RequestOptions,
  ): Promise<types.HttpStreamResponse> {
    const resolvedUrl = resolveUrl(this.config.baseUrl, url);
    const headers: Record<string, string> = {
      ...(this.config.headers ?? {}),
      ...(options?.headers ?? {}),
    };
    const bodyValue = options?.body;
    let bodyStr: string | undefined;
    if (bodyValue !== undefined) {
      if (typeof bodyValue === "string") {
        bodyStr = bodyValue;
      } else if (
        typeof bodyValue === "object" && bodyValue !== null &&
        !(bodyValue instanceof ReadableStream)
      ) {
        bodyStr = JSON.stringify(bodyValue);
        if (headers["Content-Type"] === undefined) {
          headers["Content-Type"] = "application/json";
        }
      }
    }

    const goReq: goClientModule.GoHttpRequest = {
      method: method as goClientModule.GoHttpMethod,
      url: resolvedUrl,
      headers,
      ...(bodyStr !== undefined && { body: bodyStr }),
      ...(options?.timeout !== undefined && { timeout: options.timeout }),
    };

    let resp: Awaited<ReturnType<goClientModule.GoHttpClient["requestStream"]>>;
    try {
      resp = await this.#goClient!.requestStream(goReq);
    } catch (err) {
      throw this.#classifyGoHttpError(err);
    }

    const rawHeaders = new Headers(resp.headers);
    const rateLimit = extractRateLimitInfo(rawHeaders);

    return {
      body: resp.body,
      status: resp.status,
      statusText: resp.statusText,
      headers: rawHeaders,
      request: new Request(resolvedUrl, { method, headers }),
      raw: new Response(resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers: resp.headers,
      }),
      retries: 0,
      ...(rateLimit !== undefined && { rateLimit }),
    };
  }

  /** Release the underlying Go HTTP client handle. */
  close(): void {
    this.#goClient?.close();
    this.#goClient = null;
    this.#goClientInit = null;
  }
}

// =============================================================================
// Factory
// =============================================================================

export const createHttpClient = (config?: types.HttpClientConfig): HttpClient =>
  new HttpClient(config);

// =============================================================================
// Internal Utilities
// =============================================================================

const toHttpClientError = (e: unknown): errors.HttpClientError => {
  if (e instanceof errors.HttpClientError) return e;
  const err = e instanceof Error ? e : new Error(String(e));
  return new errors.HttpClientError(err.message, { cause: err });
};

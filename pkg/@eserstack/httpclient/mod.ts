// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * @eserstack/httpclient — resilient HTTP client with retry, timeout, rate-limit
 * handling, typed errors, and @eserstack/functions Result compatibility.
 *
 * @module
 */

export {
  createHttpClient,
  extractRateLimitInfo,
  HttpClient,
  parseRetryAfter,
} from "./client.ts";
export {
  classifyAndWrap,
  classifyError,
  classifyHttpStatus,
  HttpAbortError,
  HttpClientError,
  type HttpClientErrorOptions,
  HttpNetworkError,
  HttpRateLimitError,
  HttpResponseError,
  HttpTimeoutError,
} from "./errors.ts";
export type {
  GoHttpClient,
  GoHttpClientOptions,
  GoHttpMethod,
  GoHttpRequest,
  GoHttpResponse,
  GoHttpStreamResponse,
} from "./go-client.ts";
export {
  applyRequestInterceptors,
  applyResponseInterceptors,
  InterceptorChain,
} from "./interceptors.ts";
export type {
  Fail,
  HttpClientConfig,
  HttpMethod,
  HttpResponse,
  HttpStreamResponse,
  HttpTransport,
  Interceptors,
  Ok,
  RateLimitInfo,
  RequestInterceptor,
  RequestOptions,
  ResponseInterceptor,
  Result,
  RetryConfig,
} from "./types.ts";

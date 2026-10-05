// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The Go HTTP client behind a fetch-shaped function.
 *
 * HttpClient sends every request through one pipeline: URL and header
 * building, request interceptors, the retry policy, status handling and
 * response interceptors. With `transport: "native"` only the last step, the
 * exchange itself, goes to the Go client, through the function made here.
 * Internal: not exported from the package.
 *
 * @module
 */

import * as errors from "./errors.ts";
import * as goClientModule from "./go-client.ts";

/** What HttpClient calls in place of `fetch`. */
export type FetchLike = (request: Request) => Promise<Response>;

/** Statuses whose responses have no body; `new Response` refuses one. */
const NULL_BODY_STATUSES: ReadonlySet<number> = new Set([204, 205, 304]);

const toResponse = (
  status: number,
  statusText: string,
  headers: Record<string, string>,
  body: BodyInit,
): Response =>
  new Response(NULL_BODY_STATUSES.has(status) ? null : body, {
    status,
    statusText,
    headers,
  });

/**
 * Turns a failure of the Go client into what fetch would have produced: a
 * Response for an error status, so the shared status handling and retry
 * policy see it, and an error otherwise.
 */
const toResponseOrError = (error: unknown, request: Request): Response => {
  if (error instanceof goClientModule.GoHttpError) {
    if (error.status >= 400) {
      return toResponse(
        error.status,
        error.statusText,
        error.headers,
        error.body,
      );
    }
    if (error.status === 0) {
      throw new errors.HttpNetworkError(
        `${request.method} request through the native client: ${error.message}`,
        { cause: error },
      );
    }
  }

  const cause = error instanceof Error ? error : new Error(String(error));
  throw new errors.HttpClientError(
    `${request.method} request through the native client: ${cause.message}`,
    { cause },
  );
};

/**
 * Makes a fetch-shaped function that sends each Request through `goClient`.
 * `stream` picks the Go streaming call, which hands the body over unread.
 *
 * A Go call blocks the JavaScript thread until it returns, so the request's
 * signal is checked before the call and cannot interrupt it; the Go client's
 * own `timeoutMs` bounds it.
 */
export const createGoFetch = (
  goClient: goClientModule.GoHttpClient,
  stream: boolean,
): FetchLike =>
async (request) => {
  request.signal.throwIfAborted();

  const body = request.body === null ? "" : await request.text();
  const goRequest: goClientModule.GoHttpRequest = {
    method: request.method as goClientModule.GoHttpMethod,
    url: request.url,
    headers: Object.fromEntries(request.headers),
    ...(body !== "" && { body }),
  };

  try {
    if (stream) {
      const resp = await goClient.requestStream(goRequest);
      return toResponse(resp.status, resp.statusText, resp.headers, resp.body);
    }

    const resp = await goClient.request(goRequest);
    return toResponse(resp.status, resp.statusText, resp.headers, resp.body);
  } catch (error) {
    return toResponseOrError(error, request);
  }
};

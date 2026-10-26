// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Go-backed HTTP client.
 *
 * Wraps the bridge's httpCreate, httpRequest and httpClose calls and its
 * httpRequestStream stream for lightweight HTTP requests through the Go
 * library (the native library, or the WASM fallback's host fetch).
 *
 * @module
 */

import type * as ffiTypes from "@eserstack/ajan/ffi";
import * as ffiClient from "./ffi-client.ts";

/** The HTTP methods the Go bridge sends. */
export type GoHttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

/**
 * Options for {@link createGoHttpClient}. The names are the JSON fields of the
 * Go bridge's create request (`httpCreateRequest` in
 * the ajan bridge), so every field reaches the Go client as is.
 */
export type GoHttpClientOptions = {
  /** Prefix for request URLs that are not absolute. */
  readonly baseUrl?: string;
  /** Headers sent with every request; a request's own headers win. */
  readonly headers?: Record<string, string>;
  /**
   * Time limit for one whole request, the response body included, in
   * milliseconds. Defaults to 30 000.
   */
  readonly timeoutMs?: number;
  /** Retry failed requests inside the Go client. Off unless `true`. */
  readonly retryEnabled?: boolean;
  /** Attempts in total when `retryEnabled` is set. The Go default is 3. */
  readonly maxAttempts?: number;
  /** First retry delay in milliseconds. The Go default is 100. */
  readonly initialIntervalMs?: number;
  /** Upper bound for one retry delay in milliseconds. The Go default is 10 000. */
  readonly maxIntervalMs?: number;
  /** Stop calling a failing server for a while. Off unless `true`. */
  readonly circuitBreakerEnabled?: boolean;
  /** Failures in a row that open the circuit. The Go default is 5. */
  readonly failureThreshold?: number;
  /** Milliseconds an open circuit waits before it tries again. The Go default is 10 000. */
  readonly resetTimeoutMs?: number;
};

/** One request for {@link GoHttpClient}; the fields match the Go bridge's request JSON. */
export type GoHttpRequest = {
  readonly method: GoHttpMethod;
  readonly url: string;
  readonly headers?: Record<string, string>;
  /** Text body; the Go bridge carries no binary bodies. */
  readonly body?: string;
  /**
   * Largest response body read into memory, in bytes; the Go default is
   * 32 MiB. A larger body fails the request. Use `requestStream` for more.
   */
  readonly maxResponseBytes?: number;
  /**
   * Stops the request when it fires. Only the WASM fallback can stop a
   * request in flight; the native library finishes it.
   */
  readonly signal?: AbortSignal;
};

/** A complete response from {@link GoHttpClient.request}. */
export type GoHttpResponse = {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Record<string, string>;
  readonly body: string;
  readonly retries: number;
};

/** A response from {@link GoHttpClient.requestStream}, its body unread. */
export type GoHttpStreamResponse = {
  readonly body: ReadableStream<Uint8Array>;
  readonly status: number;
  readonly statusText: string;
  readonly headers: Record<string, string>;
};

export type GoHttpErrorPayload = {
  error: string;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string;
  retries?: number;
};

/**
 * Thrown by GoHttpClient when Go returns a structured HTTP error.
 * Carries status, body, headers, and retry count for typed reconstruction.
 */
export class GoHttpError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Record<string, string>;
  readonly body: string;
  readonly retries: number;

  constructor(payload: GoHttpErrorPayload) {
    super(payload.error);
    this.name = "GoHttpError";
    this.status = payload.status ?? 0;
    this.statusText = payload.statusText ?? "";
    this.headers = payload.headers ?? {};
    this.body = payload.body ?? "";
    this.retries = payload.retries ?? 0;
  }
}

/**
 * A handle on one Go HTTP client. An error status rejects with a
 * {@link GoHttpError} that carries the status and body.
 */
export type GoHttpClient = {
  /** Sends a request and reads its whole body. */
  request(req: GoHttpRequest): Promise<GoHttpResponse>;
  /** Sends a request and returns its body as a stream. */
  requestStream(req: GoHttpRequest): Promise<GoHttpStreamResponse>;
  /** Releases the handle; later calls fail. */
  close(): void;
};

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Runs a request for a client handle, with a requestId when the request has a
 * signal, and releases the signal once the call is answered.
 */
const withSignal = async <T>(
  handle: string,
  req: GoHttpRequest,
  send: (wire: ffiTypes.HttpRequestRequest) => T | Promise<T>,
): Promise<T> => {
  const { signal, ...wire } = req;
  if (signal === undefined) {
    return await send({ handle, ...wire });
  }

  signal.throwIfAborted();
  const registration = ffiClient.registerRequestSignal(signal);
  try {
    return await send({ handle, ...wire, requestId: registration.requestId });
  } finally {
    registration.release();
  }
};

/** Decodes a base64 chunk of the bridge's stream reads. */
const decodeChunk = (chunk: string): Uint8Array => {
  const binary = atob(chunk);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
};

/**
 * Throws the RangeError for a `timeoutMs` that would leave calls unbounded.
 */
const checkedTimeout = (options: GoHttpClientOptions): number => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    // The Go client treats 0 as no limit at all, and each call blocks the
    // JavaScript thread, so an unbounded client is never created.
    throw new RangeError(
      `createGoHttpClient: timeoutMs ${timeoutMs} is not a positive number of milliseconds`,
    );
  }

  return timeoutMs;
};

/**
 * Creates a Go-backed HTTP client handle on a loaded library. Tests pass a
 * library from `@eserstack/ajan/ffi/fake`; everything else goes through
 * {@link createGoHttpClient}.
 *
 * @throws Error if the bridge refuses the client options.
 * @throws RangeError if `timeoutMs` is not a positive number.
 */
export const createGoHttpClientFor = (
  lib: ffiTypes.FFILibrary,
  options: GoHttpClientOptions = {},
): GoHttpClient => {
  const timeoutMs = checkedTimeout(options);

  const result = lib.call("httpCreate", { ...options, timeoutMs });

  if (result.error !== undefined && result.error !== "") {
    throw new Error(`createGoHttpClient: ${result.error}`);
  }

  const handle = result.handle ?? "";

  return {
    async request(req: GoHttpRequest): Promise<GoHttpResponse> {
      const res = await withSignal(handle, req, (wire) =>
        lib.call("httpRequest", wire),
      );

      if (res.error !== undefined && res.error !== "") {
        throw new GoHttpError({ ...res, error: res.error });
      }

      return res as GoHttpResponse;
    },

    async requestStream(req: GoHttpRequest): Promise<GoHttpStreamResponse> {
      const stream = await withSignal(handle, req, (wire) =>
        lib.stream("httpRequestStream", wire),
      );
      const init = stream.opened;

      if (
        (init.error !== undefined && init.error !== "") ||
        stream.handle === ""
      ) {
        throw new GoHttpError({
          error:
            init.error ??
            "open HTTP stream: the Go bridge returned no stream handle",
          status: init.status,
          statusText: init.statusText,
          headers: init.headers,
          body: init.body,
        });
      }

      const status = init.status ?? 200;
      const statusText = init.statusText ?? "";
      const headers = { ...init.headers };

      // The Go handle is released once: at the end of the body, on a read
      // error, or when the reader cancels.
      let released = false;
      const release = (): void => {
        if (!released) {
          released = true;
          stream.close();
        }
      };

      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          const chunk = await stream.read();

          if (chunk === null) {
            release();
            controller.close();
            return;
          }

          if (chunk.error !== undefined && chunk.error !== "") {
            release();
            controller.error(new Error(chunk.error));
            return;
          }

          // The last read can carry both bytes and done.
          if (chunk.chunk !== undefined && chunk.chunk !== "") {
            controller.enqueue(decodeChunk(chunk.chunk));
          }

          if (chunk.done === true) {
            release();
            controller.close();
          }
        },
        cancel() {
          release();
        },
      });

      return { body, status, statusText, headers };
    },

    close(): void {
      lib.call("httpClose", handle);
    },
  };
};

/**
 * Creates a Go-backed HTTP client handle.
 *
 * With the native library, each call into the Go client blocks the
 * JavaScript thread until it returns, which `timeoutMs` bounds. On the WASM
 * fallback the requests wait on the runtime's fetch instead.
 *
 * @throws Error if the native library is unavailable.
 * @throws RangeError if `timeoutMs` is not a positive number.
 *
 * @example
 * ```typescript
 * import * as goClient from "@eserstack/httpclient/go-client";
 *
 * const client = await goClient.createGoHttpClient({ timeoutMs: 10_000 });
 * const resp = await client.request({ method: "GET", url: "https://example.com" });
 * console.log(resp.status, resp.body);
 * client.close();
 * ```
 */
export const createGoHttpClient = async (
  options: GoHttpClientOptions = {},
): Promise<GoHttpClient> => {
  checkedTimeout(options);

  await ffiClient.ensureLib();
  const lib = ffiClient.getLib();

  if (lib === null) {
    throw new Error(
      `createGoHttpClient: the @eserstack/ajan native library is not available${ffiClient.describeLoadFailure()}`,
      { cause: ffiClient.getLoadError() ?? undefined },
    );
  }

  return createGoHttpClientFor(lib, options);
};

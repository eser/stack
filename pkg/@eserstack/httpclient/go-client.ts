// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Go-backed HTTP client.
 *
 * Wraps EserAjanHttpCreate / EserAjanHttpRequest / EserAjanHttpClose for
 * lightweight HTTP requests via the native Go library.
 *
 * @module
 */

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
 * Sends a request's JSON for a client handle, with a requestId when the
 * request has a signal, and releases the signal once the call is answered.
 */
const withSignal = async (
  handle: string,
  req: GoHttpRequest,
  send: (json: string) => string | Promise<string>,
): Promise<string> => {
  const { signal, ...wire } = req;
  if (signal === undefined) {
    return await send(JSON.stringify({ handle, ...wire }));
  }

  signal.throwIfAborted();
  const registration = ffiClient.registerRequestSignal(signal);
  try {
    return await send(
      JSON.stringify({ handle, ...wire, requestId: registration.requestId }),
    );
  } finally {
    registration.release();
  }
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
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    // The Go client treats 0 as no limit at all, and each call blocks the
    // JavaScript thread, so an unbounded client is never created.
    throw new RangeError(
      `createGoHttpClient: timeoutMs ${timeoutMs} is not a positive number of milliseconds`,
    );
  }

  await ffiClient.ensureLib();
  const lib = ffiClient.getLib();

  if (lib === null) {
    throw new Error(
      `createGoHttpClient: the @eserstack/ajan native library is not available${ffiClient.describeLoadFailure()}`,
      { cause: ffiClient.getLoadError() ?? undefined },
    );
  }

  const raw = lib.symbols.EserAjanHttpCreate(
    JSON.stringify({ ...options, timeoutMs }),
  );
  const result = JSON.parse(raw) as { handle: string; error?: string };

  if (result.error !== undefined && result.error !== "") {
    throw new Error(`createGoHttpClient: ${result.error}`);
  }

  const handle = result.handle;

  return {
    async request(req: GoHttpRequest): Promise<GoHttpResponse> {
      const lib2 = ffiClient.getLib();
      if (lib2 === null) {
        throw new Error("native library unavailable");
      }

      const raw2 = await withSignal(
        handle,
        req,
        (json) => lib2.symbols.EserAjanHttpRequest(json),
      );
      const res = JSON.parse(raw2) as GoHttpResponse & { error?: string };

      if (res.error !== undefined && res.error !== "") {
        throw new GoHttpError({ ...res, error: res.error });
      }

      return res;
    },

    async requestStream(req: GoHttpRequest): Promise<GoHttpStreamResponse> {
      const lib2 = ffiClient.getLib();
      if (lib2 === null) {
        throw new Error("native library unavailable");
      }

      const raw2 = await withSignal(
        handle,
        req,
        (json) => lib2.symbols.EserAjanHttpRequestStream(json),
      );
      const init = JSON.parse(raw2) as {
        handle?: string;
        status?: number;
        statusText?: string;
        headers?: Record<string, string>;
        body?: string;
        error?: string;
      };

      const streamHandle = init.handle;
      if (
        (init.error !== undefined && init.error !== "") ||
        streamHandle === undefined || streamHandle === ""
      ) {
        throw new GoHttpError({
          error: init.error ??
            "open HTTP stream: the Go bridge returned no stream handle",
          status: init.status,
          statusText: init.statusText,
          headers: init.headers,
          body: init.body,
        });
      }

      const status = init.status ?? 200;
      const statusText = init.statusText ?? "";
      const headers = init.headers ?? {};

      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          const lib3 = ffiClient.getLib();
          if (lib3 === null) {
            controller.error(new Error("native library unavailable"));
            return;
          }

          const readRaw = await lib3.symbols.EserAjanHttpStreamRead(
            streamHandle,
          );
          const chunk = JSON.parse(readRaw) as {
            chunk?: string;
            done?: boolean;
            error?: string;
          };

          if (chunk.error !== undefined && chunk.error !== "") {
            controller.error(new Error(chunk.error));
            return;
          }

          if (chunk.done === true) {
            controller.close();
            return;
          }

          if (chunk.chunk !== undefined && chunk.chunk !== "") {
            const binary = atob(chunk.chunk);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            controller.enqueue(bytes);
          }
        },
        cancel() {
          const lib3 = ffiClient.getLib();
          if (lib3 === null) return;
          lib3.symbols.EserAjanHttpStreamClose(streamHandle);
        },
      });

      return { body, status, statusText, headers };
    },

    close(): void {
      const lib2 = ffiClient.getLib();
      if (lib2 === null) return;
      lib2.symbols.EserAjanHttpClose(JSON.stringify({ handle }));
    },
  };
};

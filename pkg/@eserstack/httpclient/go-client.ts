// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Go-backed HTTP client.
 *
 * Wraps EserAjanHttpCreate / EserAjanHttpRequest / EserAjanHttpClose for
 * lightweight HTTP requests via the native Go library.
 *
 * @module
 */

import { ensureLib, getLib } from "./ffi-client.ts";

export type GoHttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type GoHttpClientOptions = {
  readonly baseUrl?: string;
  readonly timeout?: number;
  readonly headers?: Record<string, string>;
  readonly retries?: number;
};

export type GoHttpRequest = {
  readonly method: GoHttpMethod;
  readonly url: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
  readonly timeout?: number;
};

export type GoHttpResponse = {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Record<string, string>;
  readonly body: string;
  readonly retries: number;
};

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

export type GoHttpClient = {
  request(req: GoHttpRequest): Promise<GoHttpResponse>;
  requestStream(req: GoHttpRequest): Promise<GoHttpStreamResponse>;
  close(): void;
};

/**
 * Creates a Go-backed HTTP client handle.
 *
 * @throws Error if the native library is unavailable.
 *
 * @example
 * ```typescript
 * import { createGoHttpClient } from "@eserstack/httpclient/go-client";
 *
 * const client = await createGoHttpClient({ timeout: 10000 });
 * const resp = await client.request({ method: "GET", url: "https://example.com" });
 * console.log(resp.status, resp.body);
 * client.close();
 * ```
 */
export const createGoHttpClient = async (
  options: GoHttpClientOptions = {},
): Promise<GoHttpClient> => {
  await ensureLib();
  const lib = getLib();

  if (lib === null) {
    throw new Error("native library not available for createGoHttpClient");
  }

  const raw = lib.symbols.EserAjanHttpCreate(JSON.stringify(options));
  const result = JSON.parse(raw) as { handle: string; error?: string };

  if (result.error) {
    throw new Error(result.error);
  }

  const handle = result.handle;

  return {
    request(req: GoHttpRequest): Promise<GoHttpResponse> {
      const lib2 = getLib();
      if (lib2 === null) {
        return Promise.reject(new Error("native library unavailable"));
      }

      const raw2 = lib2.symbols.EserAjanHttpRequest(
        JSON.stringify({ handle, ...req }),
      );
      const res = JSON.parse(raw2) as GoHttpResponse & { error?: string };

      if (res.error) {
        return Promise.reject(new GoHttpError({ ...res, error: res.error }));
      }

      return Promise.resolve(res);
    },

    requestStream(req: GoHttpRequest): Promise<GoHttpStreamResponse> {
      const lib2 = getLib();
      if (lib2 === null) {
        return Promise.reject(new Error("native library unavailable"));
      }

      const raw2 = lib2.symbols.EserAjanHttpRequestStream(
        JSON.stringify({ handle, ...req }),
      );
      const init = JSON.parse(raw2) as {
        handle?: string;
        status?: number;
        statusText?: string;
        headers?: Record<string, string>;
        body?: string;
        error?: string;
      };

      if (init.error || !init.handle) {
        return Promise.reject(
          new GoHttpError({
            error: init.error ?? "failed to open HTTP stream",
            status: init.status,
            statusText: init.statusText,
            headers: init.headers,
            body: init.body,
          }),
        );
      }

      const streamHandle = init.handle;
      const status = init.status ?? 200;
      const statusText = init.statusText ?? "";
      const headers = init.headers ?? {};

      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          const lib3 = getLib();
          if (lib3 === null) {
            controller.error(new Error("native library unavailable"));
            return;
          }

          const readRaw = lib3.symbols.EserAjanHttpStreamRead(streamHandle);
          const chunk = JSON.parse(readRaw) as {
            chunk?: string;
            done?: boolean;
            error?: string;
          };

          if (chunk.error) {
            controller.error(new Error(chunk.error));
            return;
          }

          if (chunk.done) {
            controller.close();
            return;
          }

          if (chunk.chunk) {
            const binary = atob(chunk.chunk);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            controller.enqueue(bytes);
          }
        },
        cancel() {
          const lib3 = getLib();
          if (lib3 === null) return;
          lib3.symbols.EserAjanHttpStreamClose(streamHandle);
        },
      });

      return Promise.resolve({ body, status, statusText, headers });
    },

    close(): void {
      const lib2 = getLib();
      if (lib2 === null) return;
      lib2.symbols.EserAjanHttpClose(JSON.stringify({ handle }));
    },
  };
};

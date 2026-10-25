// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The `eser_host` imports of the reactor (ABI 2, TASK-277): HTTP on the
 * runtime's fetch for the http* names, which wasip1 cannot dial itself.
 *
 * With JSPI (decision-45, amended 2026-10-25), `http_fetch`, `http_read` and
 * `sleep` are `WebAssembly.Suspending`: the module waits on the host's
 * promise as if the import blocked. An import with data for the module
 * answers its size, and `http_take` copies the bytes into the buffer the
 * module allocated for them. Without JSPI the network imports answer an
 * error, so the http* names fail and everything else still works.
 *
 * The host:
 * - applies the request's timeout and its caller's AbortSignal
 *   (ffi/request-signals.ts);
 * - follows redirects itself, at most 20, and never to a different scheme,
 *   dropping Authorization and Cookie when the host changes, as Go does;
 * - reads a body up to maxResponseBytes, or keeps it open as a stream.
 *
 * @module
 */

import * as requestSignals from "../ffi/request-signals.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const MAX_REDIRECTS = 20;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Whether the runtime has JSPI. */
export const hasJspi = (): boolean =>
  typeof (WebAssembly as unknown as { Suspending?: unknown }).Suspending ===
    "function" &&
  typeof (WebAssembly as unknown as { promising?: unknown }).promising ===
    "function";

type FetchRequest = {
  readonly method: string;
  readonly url: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
  readonly requestId?: string;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
  readonly stream?: boolean;
};

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }

  return btoa(binary);
};

/** Reads a body up to `limit` bytes; null when it is larger. */
const readLimited = async (
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<Uint8Array | null> => {
  if (body === null) {
    return new Uint8Array(0);
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  for (;;) {
    // Each chunk follows the one before it.
    // deno-lint-ignore no-await-in-loop
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    size += value.length;
    if (size > limit) {
      // The reader is cancelled once, at the limit.
      // deno-lint-ignore no-await-in-loop
      await reader.cancel();
      return null;
    }

    chunks.push(value);
  }

  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }

  return out;
};

/** fetch with the redirect rules above. */
const fetchFollowing = async (
  request: FetchRequest,
  signal: AbortSignal,
): Promise<Response> => {
  let url = new URL(request.url);
  let method = request.method;
  let body: string | undefined = request.body === "" ? undefined : request.body;
  const headers = new Headers(request.headers ?? {});

  for (let hops = 0; ; hops += 1) {
    // Each redirect hop needs the previous response.
    // deno-lint-ignore no-await-in-loop
    const response = await fetch(url, {
      method,
      headers,
      body,
      redirect: "manual",
      signal,
    });

    const location = response.headers.get("location");
    if (
      !REDIRECT_STATUSES.has(response.status) ||
      location === null ||
      hops >= MAX_REDIRECTS
    ) {
      return response;
    }

    const next = new URL(location, url);
    if (next.protocol !== url.protocol) {
      // Never to another scheme: the caller gets the redirect itself.
      return response;
    }

    // The redirect's body is dropped before the next hop.
    // deno-lint-ignore no-await-in-loop
    await response.body?.cancel();

    if (next.host !== url.host) {
      headers.delete("authorization");
      headers.delete("cookie");
    }

    if (
      response.status === 303 ||
      ((response.status === 301 || response.status === 302) &&
        method === "POST")
    ) {
      method = "GET";
      body = undefined;
    }

    url = next;
  }
};

/** What the module's memory and allocator look like to the imports. */
export type HostMemory = () => WebAssembly.Memory;

/**
 * Builds the `eser_host` import object of one instance.
 *
 * @param memory - Returns the instance's memory once it exists
 * @returns The import module
 */
export const createHostImports = (
  memory: HostMemory,
): WebAssembly.ModuleImports => {
  let pending: Uint8Array | null = null;
  const streams = new Map<string, ReadableStreamDefaultReader<Uint8Array>>();
  let nextStream = 0;

  const readRequest = <T>(ptr: number, n: number): T =>
    JSON.parse(
      decoder.decode(new Uint8Array(memory().buffer, ptr, n).slice()),
    ) as T;

  const answer = (value: unknown): number => {
    pending = encoder.encode(JSON.stringify(value));
    return pending.length;
  };

  const doFetch = async (ptr: number, n: number): Promise<number> => {
    const request = readRequest<FetchRequest>(ptr, n);
    const caller = requestSignals.requestSignal(request.requestId);
    const timeout =
      request.timeoutMs !== undefined && request.timeoutMs > 0
        ? AbortSignal.timeout(request.timeoutMs)
        : undefined;
    const signal = AbortSignal.any(
      [caller, timeout].filter((s): s is AbortSignal => s !== undefined),
    );

    try {
      if (caller?.aborted === true) {
        return answer({ aborted: true });
      }

      const response = await fetchFollowing(request, signal);
      const headers = Object.fromEntries(response.headers);

      if (request.stream === true && response.status < 400) {
        nextStream += 1;
        const streamId = `stream-${nextStream}`;
        if (response.body !== null) {
          streams.set(streamId, response.body.getReader());
        }

        return answer({ status: response.status, headers, streamId });
      }

      const body = await readLimited(
        response.body,
        request.maxResponseBytes ?? 32 << 20,
      );
      if (body === null) {
        return answer({ status: response.status, headers, tooLarge: true });
      }

      return answer({ status: response.status, headers, body: toBase64(body) });
    } catch (error) {
      if (caller?.aborted === true) {
        return answer({ aborted: true });
      }

      if (timeout?.aborted === true) {
        return answer({
          timedOut: true,
          error: `no response within ${request.timeoutMs} ms (timeout)`,
        });
      }

      return answer({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const doRead = async (ptr: number, n: number): Promise<number> => {
    const { streamId } = readRequest<{ streamId: string }>(ptr, n);
    const reader = streams.get(streamId);
    if (reader === undefined) {
      return answer({ done: true });
    }

    try {
      const { done, value } = await reader.read();
      if (done) {
        streams.delete(streamId);
        return answer({ done: true });
      }

      return answer({ chunk: toBase64(value), done: false });
    } catch (error) {
      streams.delete(streamId);
      return answer({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const release = (ptr: number, n: number): void => {
    const { streamId } = readRequest<{ streamId: string }>(ptr, n);
    const reader = streams.get(streamId);
    streams.delete(streamId);
    reader?.cancel().catch(() => {});
  };

  const take = (ptr: number): void => {
    if (pending !== null) {
      new Uint8Array(memory().buffer, ptr, pending.length).set(pending);
      pending = null;
    }
  };

  if (!hasJspi()) {
    const unavailable = (): number =>
      answer({
        error:
          "the WASM fallback needs JSPI (WebAssembly.Suspending) for network; this runtime has none",
      });

    return {
      http_fetch: unavailable,
      http_read: unavailable,
      http_release: release,
      http_take: take,
      sleep: () => {},
    };
  }

  const Suspending = (
    WebAssembly as unknown as {
      Suspending: new (fn: (...args: number[]) => Promise<unknown>) => unknown;
    }
  ).Suspending;

  return {
    http_fetch: new Suspending(doFetch),
    http_read: new Suspending(doRead),
    http_release: release,
    http_take: take,
    sleep: new Suspending(
      (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    ),
  } as WebAssembly.ModuleImports;
};

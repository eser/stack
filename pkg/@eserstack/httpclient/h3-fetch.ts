// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * HTTP/3-capable fetch polyfill for Node.js.
 *
 * ## Current status
 *
 * `undici` (Node's built-in fetch engine) does not yet ship stable HTTP/3
 * support. The long-term path is to extend pkg/@eserstack/ajan/bridge.go
 * (the FFI HTTP client at bridge.go:823-847) with a `protocol:"h3"` flag so
 * the TS bridge gets HTTP/3 via Go's quic-go transport. That keeps a single
 * HTTP/3 implementation in Go and avoids shipping a second UDP stack in Node.
 *
 * ## Usage today
 *
 * In browser environments, the native `fetch` already negotiates h3 ALPN
 * automatically — no polyfill needed. Just use createHttpClient() as normal.
 *
 * In Node environments talking to a noskills-server:
 * 1. For REST requests: use the standard fetch (Node 22+ has native fetch over
 *    HTTP/1.1 / HTTP/2; the daemon falls back to TCP if QUIC is unavailable).
 * 2. For WebTransport sessions: use @eserstack/webtransport which wraps the
 *    browser WebTransport API (Node 22+ --experimental-fetch) or the FFI bridge.
 *
 * ## Future path
 *
 * When the FFI bridge is extended, replace the body of createH3FetchFn with:
 * ```ts
 * import { createFfiFetch } from "@eserstack/ajan/bridge-http";
 * export const createH3FetchFn = (certHashes?: ArrayBuffer[]) =>
 *   createFfiFetch({ protocol: "h3", certHashes });
 * ```
 *
 * @module
 */

/** Options for creating an HTTP/3 fetch function. */
export interface H3FetchOptions {
  /**
   * SHA-256 DER fingerprints for certificate pinning. When provided, the
   * server certificate is accepted if its fingerprint matches any supplied hash,
   * bypassing CA chain validation.
   */
  certHashes?: ArrayBuffer[];
}

/**
 * Returns a fetch-compatible function that uses HTTP/3.
 *
 * In browsers, `fetch` already negotiates h3 automatically — this is a no-op
 * that returns the native `fetch`. In Node, this falls back to native fetch
 * until the FFI bridge grows HTTP/3 support.
 *
 * Pass the returned function to createHttpClient via the `fetchFn` config field:
 * ```ts
 * const client = createHttpClient({
 *   baseUrl: "https://localhost:4433",
 *   fetchFn: createH3FetchFn({ certHashes }),
 * });
 * ```
 */
export function createH3FetchFn(
  _options: H3FetchOptions = {},
): typeof fetch {
  // Future: when bridge.go exposes protocol:"h3", replace this with the FFI path.
  // For now, return native fetch — browsers negotiate h3 automatically.
  if (typeof globalThis.fetch !== "function") {
    throw new Error(
      "@eserstack/httpclient/h3-fetch: fetch is not available in this environment. " +
        "Use Node 22+ or provide a custom fetchFn.",
    );
  }

  return globalThis.fetch.bind(globalThis);
}

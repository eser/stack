// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * A fetch function for HTTP/3 servers such as noskills-server.
 *
 * `createH3FetchFn` returns the runtime's own `fetch`. Browsers negotiate
 * HTTP/3 by themselves when the server advertises it, so the native `fetch`
 * already speaks it there. This package has no HTTP/3 transport of its own:
 * outside a browser, `fetch` speaks whatever the runtime supports.
 *
 * It pins no certificate. Pin a self-signed certificate through the runtime
 * (for example `Deno.createHttpClient({ caCerts })`) or, for WebTransport,
 * through `serverCertificateHashes` in `@eserstack/webtransport`.
 *
 * @module
 */

/**
 * Returns the global `fetch`, bound to `globalThis`, for use as the `fetchFn`
 * of `createHttpClient`.
 *
 * @throws Error when the runtime has no global `fetch`.
 *
 * @example
 * ```ts
 * import * as httpclient from "@eserstack/httpclient";
 * import * as h3Fetch from "@eserstack/httpclient/h3-fetch";
 *
 * const client = httpclient.createHttpClient({
 *   baseUrl: "https://localhost:4433",
 *   fetchFn: h3Fetch.createH3FetchFn(),
 * });
 * ```
 */
export function createH3FetchFn(): typeof fetch {
  if (typeof globalThis.fetch !== "function") {
    throw new Error(
      "createH3FetchFn: this runtime has no global fetch; use Node 18 or later, Deno or a browser, or pass your own fetchFn to createHttpClient",
    );
  }

  return globalThis.fetch.bind(globalThis);
}

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * WebTransport client implementation for browser environments.
 *
 * Browser:  uses globalThis.WebTransport directly. Chrome 97+, Edge 97+,
 *           Safari 18.2+, Firefox 114+ (experimental). h3 ALPN is negotiated
 *           automatically by the browser — no client-side configuration needed.
 *
 * Node:     Node 22+ has experimental WebTransport via --experimental-fetch.
 *           Long-term path: extend the ajan bridge HTTP-client FFI
 *           surface with protocol:"h3" so the TS bridge gets HTTP/3 natively.
 *
 * @module
 */

import type {
  WebTransportClient as IWebTransportClient,
  WebTransportConfig,
  WebTransportSession as IWebTransportSession,
} from "./types.ts";

class WebTransportSessionImpl implements IWebTransportSession {
  readonly inner: WebTransport;

  constructor(wt: WebTransport) {
    this.inner = wt;
  }

  get ready(): Promise<void> {
    return this.inner.ready;
  }

  get closed(): Promise<WebTransportCloseInfo> {
    return this.inner.closed;
  }

  get datagrams(): {
    readonly readable: ReadableStream<Uint8Array>;
    readonly writable: WritableStream<Uint8Array>;
  } {
    return this.inner.datagrams;
  }

  openBidirectionalStream(): Promise<WebTransportBidirectionalStream> {
    return this.inner.createBidirectionalStream();
  }

  acceptBidirectionalStream(): Promise<WebTransportBidirectionalStream> {
    const reader = this.inner.incomingBidirectionalStreams.getReader();

    return reader.read().then(({ value, done }) => {
      reader.releaseLock();

      if (done || value === undefined) {
        return Promise.reject(new Error("WebTransport session closed"));
      }

      return value;
    });
  }

  openUnidirectionalStream(): Promise<WritableStream<Uint8Array>> {
    return this.inner.createUnidirectionalStream();
  }

  close(closeInfo?: WebTransportCloseInfo): void {
    this.inner.close(closeInfo);
  }
}

class WebTransportClientImpl implements IWebTransportClient {
  readonly #config: WebTransportConfig;

  constructor(config: WebTransportConfig) {
    this.#config = config;
  }

  async connect(
    urlOrPath: string,
    _headers?: Record<string, string>,
  ): Promise<IWebTransportSession> {
    const url = this.#resolveUrl(urlOrPath);
    const options = this.#buildOptions();
    const newTransport = this.#config._newTransport;

    const wt = newTransport !== undefined
      ? newTransport(url, options)
      : new globalThis.WebTransport(url, options);

    await this.#waitUntilReady(wt);

    return new WebTransportSessionImpl(wt);
  }

  async #waitUntilReady(wt: WebTransport): Promise<void> {
    const timeout = this.#config.dialTimeout ?? 0;

    if (timeout <= 0) {
      await wt.ready;
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), timeout);
    });

    try {
      const outcome = await Promise.race([
        wt.ready.then(() => "ready" as const),
        timedOut,
      ]);

      if (outcome === "timeout") {
        // Abandon the attempt so a late handshake does not leave an open
        // session nobody holds.
        wt.close();
        // The URL is left out: it can carry the session token as a query
        // parameter.
        throw new Error(
          `WebTransport dial timed out after ${timeout} ms; check that the server is reachable, or raise dialTimeout`,
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }

  #resolveUrl(urlOrPath: string): string {
    const baseUrl = this.#config.baseUrl;

    if (
      baseUrl === undefined || baseUrl === "" ||
      urlOrPath.startsWith("https://") || urlOrPath.startsWith("http://")
    ) {
      return urlOrPath;
    }

    const base = baseUrl.replace(/\/$/, "");
    const path = urlOrPath.startsWith("/") ? urlOrPath : `/${urlOrPath}`;

    return `${base}${path}`;
  }

  #buildOptions(): WebTransportOptions {
    const opts: WebTransportOptions = {};
    const certHashes = this.#config.certHashes;

    if (certHashes !== undefined && certHashes.length > 0) {
      opts.serverCertificateHashes = certHashes.map((hash) => ({
        algorithm: "sha-256",
        value: hash,
      }));
    }

    return opts;
  }
}

/**
 * Creates a WebTransport client. Parallel to createHttpClient from
 * @eserstack/httpclient — same factory pattern, same config shape.
 *
 * @example
 * ```ts
 * const client = createWebTransportClient({ baseUrl: "https://localhost:4433" });
 * const session = await client.connect("/attach/my-project/session-id");
 * const stream = await session.openBidirectionalStream();
 * ```
 */
export function createWebTransportClient(
  config: WebTransportConfig = {},
): IWebTransportClient {
  return new WebTransportClientImpl(config);
}

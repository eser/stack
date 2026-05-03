// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * WebTransport client implementation for browser environments.
 *
 * Browser:  uses globalThis.WebTransport directly. Chrome 97+, Edge 97+,
 *           Safari 18.2+, Firefox 114+ (experimental). h3 ALPN is negotiated
 *           automatically by the browser — no client-side configuration needed.
 *
 * Node:     Node 22+ has experimental WebTransport via --experimental-fetch.
 *           Long-term path: extend pkg/@eserstack/ajan/bridge.go HTTP-client FFI
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
    const reader =
      this.inner.incomingBidirectionalStreams.getReader();

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

    const wt = this.#config._newTransport
      ? this.#config._newTransport(url, options)
      : new WebTransport(url, options);

    if (this.#config.dialTimeout && this.#config.dialTimeout > 0) {
      const timeout = this.#config.dialTimeout;

      await Promise.race([
        wt.ready,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`WebTransport dial timeout after ${timeout}ms`)),
            timeout,
          ),
        ),
      ]);
    } else {
      await wt.ready;
    }

    return new WebTransportSessionImpl(wt);
  }

  #resolveUrl(urlOrPath: string): string {
    if (!this.#config.baseUrl || urlOrPath.startsWith("https://") || urlOrPath.startsWith("http://")) {
      return urlOrPath;
    }

    const base = this.#config.baseUrl.replace(/\/$/, "");
    const path = urlOrPath.startsWith("/") ? urlOrPath : `/${urlOrPath}`;

    return `${base}${path}`;
  }

  #buildOptions(): WebTransportOptions {
    const opts: WebTransportOptions = {};

    if (this.#config.certHashes && this.#config.certHashes.length > 0) {
      opts.serverCertificateHashes = this.#config.certHashes.map((hash) => ({
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

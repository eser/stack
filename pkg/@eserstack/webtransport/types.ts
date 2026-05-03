// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Public type definitions for @eserstack/webtransport.
 *
 * Config shape is intentionally parallel to @eserstack/httpclient.HttpClientConfig
 * so contributors switching contexts need no relearning.
 *
 * @module
 */

/**
 * Configuration for createWebTransportClient.
 *
 * @property baseUrl     - Base URL for connections (e.g. "https://localhost:4433").
 * @property certHashes  - SHA-256 DER fingerprints for certificate pinning.
 *                         Passed as serverCertificateHashes to the browser WebTransport API.
 *                         Use for self-signed development certs when mkcert is unavailable.
 * @property dialTimeout - Abort connection attempt after this many milliseconds. 0 = no cap.
 * @property _dialFn     - Escape hatch for testing: inject a custom WebTransport constructor.
 */
export interface WebTransportConfig {
  baseUrl?: string;
  certHashes?: ArrayBuffer[];
  dialTimeout?: number;
  /** Inject a custom WebTransport factory for testing without a live server. */
  _newTransport?: (url: string, options?: WebTransportOptions) => WebTransport;
}

/**
 * A connected WebTransport session.
 * Methods mirror the browser WebTransport API but are wrapped for
 * ergonomics and testability.
 */
export interface WebTransportSession {
  /** Open a new bidirectional stream. */
  openBidirectionalStream(): Promise<WebTransportBidirectionalStream>;
  /** Accept an incoming bidirectional stream from the server. */
  acceptBidirectionalStream(): Promise<WebTransportBidirectionalStream>;
  /** Open a new unidirectional (send-only) stream. */
  openUnidirectionalStream(): Promise<WritableStream<Uint8Array>>;
  /** Datagrams — unreliable, lossy. Use only for presence / typing signals. */
  datagrams: {
    readonly readable: ReadableStream<Uint8Array>;
    readonly writable: WritableStream<Uint8Array>;
  };
  /** Resolved when the session is ready to use. */
  readonly ready: Promise<void>;
  /** Resolved when the session is closed (cleanly or with error). */
  readonly closed: Promise<WebTransportCloseInfo>;
  /** Close the session. */
  close(closeInfo?: WebTransportCloseInfo): void;
  /** Underlying native WebTransport object (escape hatch). */
  readonly inner: WebTransport;
}

/**
 * Top-level client returned by createWebTransportClient.
 * Use connect() to open a session; keep the client alive to share
 * the underlying QUIC connection across sessions (future optimisation).
 */
export interface WebTransportClient {
  connect(url: string): Promise<WebTransportSession>;
  connect(url: string, headers?: Record<string, string>): Promise<WebTransportSession>;
}

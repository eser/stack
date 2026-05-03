// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * WebTransport session attach for noskills-client.
 *
 * Opens a bidi stream to /attach/{slug}/{sessionId} on the daemon and
 * exposes a typed async-iterable event stream plus a send() helper.
 *
 * The daemon replays the JSONL ledger first (transcript_replay_start …
 * transcript_replay_end) then enters live mode. The caller iterates
 * events() and renders them in sequence — no distinction needed between
 * replay and live; the marker events are included for UI progress if wanted.
 *
 * On cert_rotating: stop iteration, call fetchAndPinCertFingerprint() with
 * the new fingerprint, then reconnect.
 *
 * @module
 */

import * as webtransportModule from "@eserstack/webtransport/client";
import type { WebTransportSession } from "@eserstack/webtransport/types";
import type {
  AttachSession,
  ClientCommand,
  DaemonEvent,
  NoskillsClientConfig,
} from "./types.ts";
import { getCertFingerprint } from "./cert.ts";

// =============================================================================
// Line-delimited JSON reader over a bidi stream
// =============================================================================

async function* readLines(
  readable: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = readable.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trimEnd();
        buf = buf.slice(nl + 1);
        if (line.length > 0) {
          yield line;
        }
      }
    }
    // Flush any remaining partial line (shouldn't happen in NDJSON but be safe)
    const remaining = buf.trimEnd();
    if (remaining.length > 0) {
      yield remaining;
    }
  } finally {
    reader.releaseLock();
  }
}

// =============================================================================
// AttachSession implementation
// =============================================================================

class AttachSessionImpl implements AttachSession {
  readonly #session: WebTransportSession;
  readonly #stream: WebTransportBidirectionalStream;
  readonly #writer: WritableStreamDefaultWriter<Uint8Array>;
  readonly #encoder: TextEncoder;
  #closed = false;
  #lastSeq = 0;

  constructor(
    session: WebTransportSession,
    stream: WebTransportBidirectionalStream,
  ) {
    this.#session = session;
    this.#stream = stream;
    this.#writer = stream.writable.getWriter();
    this.#encoder = new TextEncoder();
  }

  get lastSeq(): number {
    return this.#lastSeq;
  }

  async *events(): AsyncIterable<DaemonEvent> {
    for await (const line of readLines(this.#stream.readable)) {
      let evt: DaemonEvent;
      try {
        evt = JSON.parse(line) as DaemonEvent;
      } catch {
        continue;
      }
      if (typeof evt.seq === "number") {
        this.#lastSeq = evt.seq;
      }
      yield evt;
    }
  }

  async send(cmd: ClientCommand): Promise<void> {
    if (this.#closed) {
      throw new Error("AttachSession is closed");
    }
    const line = JSON.stringify(cmd) + "\n";
    await this.#writer.write(this.#encoder.encode(line));
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#writer.releaseLock();
    this.#session.close();
  }
}

// =============================================================================
// Public API
// =============================================================================

export interface AttachOptions {
  /**
   * Pre-fetched cert fingerprint as ArrayBuffer.
   * If omitted, getCertFingerprint(config.baseUrl) is called automatically
   * (fetches daemon endpoint + caches in IndexedDB).
   */
  certHash?: ArrayBuffer | null;
  /**
   * Additional headers sent on the WebTransport CONNECT request.
   * Most useful for passing the token on non-browser platforms; browsers
   * can't set arbitrary headers on WebTransport so use ?token= instead.
   */
  headers?: Record<string, string>;
  /**
   * Resume from this sequence number (the lastSeq of a previous AttachSession).
   * The server will skip ledger replay events whose seq ≤ afterSeq, sending
   * only new events. Use this after a network partition to avoid re-receiving
   * events the client already processed.
   *
   * @example
   * ```ts
   * let session = await attachSession(config, slug, sid);
   * // ... network drop ...
   * session = await attachSession(config, slug, sid, { afterSeq: session.lastSeq });
   * ```
   */
  afterSeq?: number;
}

/**
 * Attach to a running session on the daemon.
 *
 * Opens a WebTransport bidi stream to /attach/{slug}/{sessionId}?token={token}.
 * The token is appended as a query parameter because browser WebTransport does
 * not support custom headers; the daemon's PIN auth middleware reads it there.
 *
 * @example
 * ```ts
 * const session = await attachSession(config, "my-project", "01HV...");
 * for await (const evt of session.events()) {
 *   if (evt.type === "delta") console.log(evt.text);
 * }
 * ```
 */
export async function attachSession(
  config: NoskillsClientConfig,
  slug: string,
  sessionId: string,
  opts: AttachOptions = {},
): Promise<AttachSession> {
  // Resolve cert hash: prefer explicit → cached/fetched → null (mkcert mode)
  let certHash: ArrayBuffer | null;
  if (opts.certHash !== undefined) {
    certHash = opts.certHash;
  } else if (config.certHashes && config.certHashes.length > 0) {
    certHash = config.certHashes[0]!;
  } else {
    certHash = await getCertFingerprint(config.baseUrl);
  }

  const certHashes = certHash ? [certHash] : undefined;

  const wtClient = webtransportModule.createWebTransportClient({
    baseUrl: config.baseUrl,
    certHashes,
  });

  // Build query string: token and after go here because browser WebTransport
  // cannot set custom headers on the CONNECT request.
  const params = new URLSearchParams();
  if (config.token) params.set("token", config.token);
  if (opts.afterSeq && opts.afterSeq > 0) params.set("after", String(opts.afterSeq));
  const query = params.size > 0 ? `?${params.toString()}` : "";
  const path = `/attach/${encodeURIComponent(slug)}/${encodeURIComponent(sessionId)}${query}`;

  const wtSession = await wtClient.connect(path, opts.headers);
  const stream = await wtSession.openBidirectionalStream();

  return new AttachSessionImpl(wtSession, stream);
}

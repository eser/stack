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
 * On cert_rotating: stop iteration, call storeCertFingerprint(baseUrl,
 * newFingerprint), then attach again.
 *
 * @module
 */

import * as webtransport from "@eserstack/webtransport";
import type {
  AttachSession,
  ClientCommand,
  DaemonEvent,
  NoskillsClientConfig,
} from "./types.ts";
import * as cert from "./cert.ts";
import * as deadline from "./deadline.ts";

const ATTACH_TIMEOUT_MS = 10_000;
const SHA256_BYTES = 32;

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
      // A stream reader hands out chunks in order, one read at a time.
      // deno-lint-ignore no-await-in-loop
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
  readonly #session: webtransport.WebTransportSession;
  readonly #stream: WebTransportBidirectionalStream;
  readonly #writer: WritableStreamDefaultWriter<Uint8Array>;
  readonly #encoder: TextEncoder;
  #closed = false;
  #lastSeq = 0;

  constructor(
    session: webtransport.WebTransportSession,
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
        // A line that is not JSON is skipped rather than ending the stream.
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

/** Options for {@link attachSession}. */
export interface AttachOptions {
  /**
   * One SHA-256 certificate fingerprint (32 bytes) to pin in place of
   * `config.certHashes`. `null` pins nothing and fetches nothing, for a
   * certificate the operating system trusts. If omitted, the attach pins
   * `config.certHashes`, or else calls getCertFingerprint(config.baseUrl)
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
   * import * as noskillsClient from "@eserstack/noskills-client";
   *
   * const config = { baseUrl: "https://localhost:4433", token: "your_token" };
   * let session = await noskillsClient.attachSession(config, "your_project_slug", "your_session_id");
   * // ... network drop ...
   * session = await noskillsClient.attachSession(config, "your_project_slug", "your_session_id", {
   *   afterSeq: session.lastSeq,
   * });
   * ```
   */
  afterSeq?: number;
  /**
   * Worker flavour to attach with — must match the session's `kind` (sent as
   * `?kind=` so the daemon spawns the right worker on first attach). Use "mux"
   * for a terminal-multiplexer session; omit (or "agent"/"acp") for an agent
   * session, which is served by the ACP worker.
   */
  kind?: "agent" | "acp" | "mux";
  /**
   * Cancels the attach while it fetches the fingerprint, dials and opens the
   * stream; the promise then rejects with the signal's reason. It does not
   * close a session that is already attached: call `close()` for that.
   */
  signal?: AbortSignal;
  /**
   * Milliseconds the whole attach may take, the fingerprint fetch, the
   * WebTransport handshake and the stream included, before it throws
   * `NoskillsTimeoutError`. Defaults to 10 000.
   */
  timeoutMs?: number;
}

/** Checks that a configured pin has the size of a SHA-256 fingerprint. */
function checkPin(hash: ArrayBuffer, name: string): ArrayBuffer {
  if (hash.byteLength !== SHA256_BYTES) {
    throw new RangeError(
      `${name} is ${hash.byteLength} bytes; a SHA-256 certificate fingerprint is ${SHA256_BYTES} bytes`,
    );
  }
  return hash;
}

/**
 * The pins the caller configured: every `config.certHashes` entry, the
 * `certHash` option in their place, or `[]` for `certHash: null`. Returns null
 * when nothing is configured and the daemon has to be asked.
 */
function configuredPins(
  config: NoskillsClientConfig,
  opts: AttachOptions,
): readonly ArrayBuffer[] | null {
  if (opts.certHash === null) {
    return [];
  }
  if (opts.certHash !== undefined) {
    return [checkPin(opts.certHash, "the certHash option")];
  }
  if (config.certHashes !== undefined && config.certHashes.length > 0) {
    return config.certHashes.map((hash, index) =>
      checkPin(hash, `config.certHashes[${index}]`)
    );
  }
  return null;
}

function sameBytes(a: ArrayBuffer, b: ArrayBuffer): boolean {
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  return left.length === right.length &&
    left.every((byte, index) => byte === right[index]);
}

/** Dials the daemon with `pins` and opens the session's bidi stream. */
async function dial(
  config: NoskillsClientConfig,
  pins: readonly ArrayBuffer[],
  path: string,
  headers: Record<string, string> | undefined,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<AttachSession> {
  const wtClient = webtransport.createWebTransportClient({
    baseUrl: config.baseUrl,
    certHashes: pins.length > 0 ? [...pins] : undefined,
    // connect() takes no signal, so a handshake the attach gave up on is
    // closed by this limit instead.
    dialTimeout: timeoutMs,
  });

  const wtSession = await deadline.raceSignal(
    wtClient.connect(path, headers),
    signal,
    (late) => late.close(),
  );
  try {
    const stream = await deadline.raceSignal(
      wtSession.openBidirectionalStream(),
      signal,
      () => {}, // closing the session below closes a late stream with it
    );
    return new AttachSessionImpl(wtSession, stream);
  } catch (error) {
    wtSession.close();
    throw error;
  }
}

/**
 * Attach to a running session on the daemon.
 *
 * Opens a WebTransport bidi stream to /attach/{slug}/{sessionId}?token={token}.
 * The token is appended as a query parameter because browser WebTransport does
 * not support custom headers; the daemon's PIN auth middleware reads it there.
 *
 * Without a configured pin, the attach pins the fingerprint cached for the
 * daemon. When the handshake fails with that pin, it asks the daemon for its
 * current fingerprint and, if the certificate changed, dials once more.
 *
 * @throws {NoskillsTimeoutError} When the attach takes longer than
 *   `timeoutMs` (10 000 by default).
 *
 * @example
 * ```ts
 * import * as noskillsClient from "@eserstack/noskills-client";
 *
 * const session = await noskillsClient.attachSession(
 *   { baseUrl: "https://localhost:4433", token: "your_token" },
 *   "your_project_slug",
 *   "your_session_id",
 * );
 * for await (const evt of session.events()) {
 *   if (evt.type === "query_done") break;
 * }
 * ```
 */
export async function attachSession(
  config: NoskillsClientConfig,
  slug: string,
  sessionId: string,
  opts: AttachOptions = {},
): Promise<AttachSession> {
  const timeoutMs = opts.timeoutMs ?? ATTACH_TIMEOUT_MS;
  const pins = configuredPins(config, opts);

  // Build query string: token and after go here because browser WebTransport
  // cannot set custom headers on the CONNECT request.
  const params = new URLSearchParams();
  if (config.token !== undefined && config.token !== "") {
    params.set("token", config.token);
  }
  if (opts.afterSeq !== undefined && opts.afterSeq > 0) {
    params.set("after", String(opts.afterSeq));
  }
  if (opts.kind !== undefined) {
    params.set("kind", opts.kind);
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";
  const path = `/attach/${encodeURIComponent(slug)}/${
    encodeURIComponent(sessionId)
  }${query}`;

  return await deadline.withDeadline(
    `attach ${slug}/${sessionId}`,
    timeoutMs,
    opts.signal,
    async (signal) => {
      if (pins !== null) {
        return await dial(config, pins, path, opts.headers, timeoutMs, signal);
      }

      const fetchOptions = { signal, timeoutMs };
      const pin = await cert.getCertFingerprint(config.baseUrl, fetchOptions);
      if (pin === null) {
        return await dial(config, [], path, opts.headers, timeoutMs, signal);
      }

      try {
        return await dial(config, [pin], path, opts.headers, timeoutMs, signal);
      } catch (error) {
        if (signal.aborted) {
          throw error;
        }

        // The pin may be stale: the daemon can have a new certificate since
        // it was cached. Ask for the current one and dial again if it changed.
        let current: ArrayBuffer | null;
        try {
          current = await cert.fetchAndPinCertFingerprint(
            config.baseUrl,
            fetchOptions,
          );
        } catch {
          // The daemon cannot report a fingerprint either; the dial error
          // says why the attach failed.
          throw error;
        }
        if (current === null || sameBytes(current, pin)) {
          throw error;
        }
        return await dial(
          config,
          [current],
          path,
          opts.headers,
          timeoutMs,
          signal,
        );
      }
    },
    (late) => late.close(),
  );
}

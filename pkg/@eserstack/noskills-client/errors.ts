// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Errors thrown by noskills-client.
 *
 * A cancelled call does not use these: when your `signal` aborts, the call
 * rejects with the signal's reason, as `fetch` does.
 *
 * @module
 */

/** A call to the daemon did not finish within its time limit. */
export class NoskillsTimeoutError extends Error {
  /** The call that timed out, such as `GET /api/health` or `attach app/s-1`. */
  readonly operation: string;
  /** The limit that passed, in milliseconds. */
  readonly timeoutMs: number;

  /** Names the call that timed out and the limit, in milliseconds, it had. */
  constructor(operation: string, timeoutMs: number, options?: ErrorOptions) {
    super(
      `${operation}: the daemon did not answer within ${timeoutMs} ms; check that it is running and reachable, or raise timeoutMs`,
      options,
    );
    this.name = "NoskillsTimeoutError";
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

/** The daemon answered a REST call with an error status. */
export class NoskillsResponseError extends Error {
  /** The HTTP method of the call. */
  readonly method: string;
  /** The request path, without the base URL. */
  readonly path: string;
  /** The HTTP status the daemon answered with. */
  readonly status: number;
  /** The response body, or the status text when the body could not be read. */
  readonly detail: string;

  /** Describes the call and the daemon's answer. */
  constructor(method: string, path: string, status: number, detail: string) {
    super(`${method} ${path} → ${status}: ${detail}`);
    this.name = "NoskillsResponseError";
    this.method = method;
    this.path = path;
    this.status = status;
    this.detail = detail;
  }
}

/**
 * The daemon's certificate fingerprint could not be fetched: the request
 * failed, the endpoint answered with an error status, or the answer was not a
 * SHA-256 fingerprint.
 */
export class CertFingerprintError extends Error {
  /** The fingerprint endpoint that was asked. */
  readonly url: string;
  /** The HTTP status, or `null` when no response arrived or it was a 2xx. */
  readonly status: number | null;

  /** Names the endpoint, the status if one arrived, and what was wrong. */
  constructor(
    url: string,
    status: number | null,
    reason: string,
    options?: ErrorOptions,
  ) {
    super(`fetch certificate fingerprint from ${url}: ${reason}`, options);
    this.name = "CertFingerprintError";
    this.url = url;
    this.status = status;
  }
}

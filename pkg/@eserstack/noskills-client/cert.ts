// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Cert fingerprint helpers for noskills-client.
 *
 * Fetches GET /api/cert-fingerprint (unauthenticated) and caches the result in
 * IndexedDB, keyed by the origin of the daemon's base URL, so WebTransport
 * clients can pin each daemon's self-signed leaf cert via
 * serverCertificateHashes. This bypasses OS CA trust entirely, which is the
 * only option on iOS Safari 16.4+ for PWA mode.
 *
 * When the daemon emits a {type:"cert_rotating", newFingerprint} event, call
 * storeCertFingerprint(baseUrl, newFingerprint), then attach again.
 *
 * @module
 */

import type { CallOptions } from "./types.ts";
import * as deadline from "./deadline.ts";
import * as errors from "./errors.ts";

const DB_NAME = "noskills-cert";
const DB_STORE = "fingerprints";
const CERT_FINGERPRINT_TIMEOUT_MS = 10_000;
const SHA256_BYTES = 32;
const FINGERPRINT_FORMAT =
  "64 hex digits, optionally separated by colons or spaces";

// =============================================================================
// Fingerprint values
// =============================================================================

/**
 * The cache key for a daemon: the origin of its base URL, so two daemons on
 * one machine, or one host on two ports, keep their own pins.
 */
function cacheKey(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch (error) {
    throw new TypeError(
      `baseUrl "${baseUrl}" is not an absolute URL; expected one like https://localhost:4433`,
      { cause: error },
    );
  }
  return url.origin;
}

/**
 * Reads a SHA-256 fingerprint written as hex, in the compact form or the
 * colon-separated display form. Returns null for anything that is not 32
 * bytes of hex.
 */
function parseFingerprint(hex: string): Uint8Array<ArrayBuffer> | null {
  const clean = hex.replace(/[:\s]/g, "");
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    return null;
  }

  return Uint8Array.from(
    { length: SHA256_BYTES },
    (_, index) => Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16),
  );
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// =============================================================================
// IndexedDB helpers
// =============================================================================

function openCertDB(): Promise<IDBDatabase> {
  // Typed as always present, but undefined outside browsers.
  const factory: IDBFactory | undefined = globalThis.indexedDB;
  if (factory === undefined) {
    return Promise.reject(
      new Error(
        `open IndexedDB database "${DB_NAME}": IndexedDB is not available in this runtime; pin the certificate with certHashes in NoskillsClientConfig instead`,
      ),
    );
  }

  return new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Persist the hex fingerprint of the daemon at `baseUrl` to IndexedDB, in
 * place of the one stored for the same origin.
 *
 * @throws {RangeError} When `fingerprint` is not a SHA-256 fingerprint.
 */
export async function storeCertFingerprint(
  baseUrl: string,
  fingerprint: string,
): Promise<void> {
  const key = cacheKey(baseUrl);
  const bytes = parseFingerprint(fingerprint);
  if (bytes === null) {
    throw new RangeError(
      `store certificate fingerprint for ${key}: the value is not a SHA-256 fingerprint; expected ${FINGERPRINT_FORMAT}`,
    );
  }

  const db = await openCertDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      const req = tx.objectStore(DB_STORE).put(toHex(bytes), key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Load the hex fingerprint stored for the daemon at `baseUrl` from IndexedDB.
 * Returns null if that origin has none.
 */
export async function loadCertFingerprint(
  baseUrl: string,
): Promise<string | null> {
  const key = cacheKey(baseUrl);
  const db = await openCertDB();
  try {
    const result = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const req = tx.objectStore(DB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return typeof result === "string" ? result : null;
  } finally {
    db.close();
  }
}

// =============================================================================
// Fetch from daemon
// =============================================================================

/**
 * Fetch the current daemon TLS fingerprint from GET /api/cert-fingerprint,
 * store it in IndexedDB and return it as an ArrayBuffer for WebTransport.
 *
 * Returns null when the daemon has no fingerprint endpoint (a 404): its
 * certificate is one the operating system trusts, such as mkcert's, and there
 * is nothing to pin. The request waits 10 000 ms unless `options.timeoutMs`
 * says otherwise.
 *
 * @throws {CertFingerprintError} When the request fails, the endpoint answers
 *   with another error status, or the answer is not a SHA-256 fingerprint.
 * @throws {NoskillsTimeoutError} When the daemon does not answer in time.
 */
export async function fetchAndPinCertFingerprint(
  baseUrl: string,
  options: CallOptions = {},
): Promise<ArrayBuffer | null> {
  cacheKey(baseUrl); // rejects a malformed baseUrl before any request
  const url = `${baseUrl.replace(/\/$/, "")}/api/cert-fingerprint`;

  const answer = await deadline.withDeadline(
    "GET /api/cert-fingerprint",
    options.timeoutMs ?? CERT_FINGERPRINT_TIMEOUT_MS,
    options.signal,
    (signal) => fetchFingerprintAnswer(url, signal),
  );
  if (answer === null) {
    return null;
  }

  const fields = answer.body instanceof Object
    ? answer.body as { algorithm?: unknown; fingerprint?: unknown }
    : {};
  if (fields.algorithm !== undefined && fields.algorithm !== "sha-256") {
    throw new errors.CertFingerprintError(
      url,
      null,
      `the fingerprint uses algorithm ${
        JSON.stringify(fields.algorithm)
      }; only sha-256 can be pinned`,
    );
  }

  const bytes = typeof fields.fingerprint === "string"
    ? parseFingerprint(fields.fingerprint)
    : null;
  if (bytes === null) {
    throw new errors.CertFingerprintError(
      url,
      null,
      `the answer has no SHA-256 fingerprint; expected a "fingerprint" field of ${FINGERPRINT_FORMAT}`,
    );
  }

  // The cache only saves a fetch on the next attach, so a failed write (no
  // IndexedDB outside browsers) does not fail this call.
  await storeCertFingerprint(baseUrl, toHex(bytes)).catch(() => {});
  return bytes.buffer;
}

/** The fingerprint endpoint's parsed JSON body, or null for a 404. */
async function fetchFingerprintAnswer(
  url: string,
  signal: AbortSignal,
): Promise<{ readonly body: unknown } | null> {
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (signal.aborted) {
      throw error; // a timeout or the caller's abort, reported by withDeadline
    }
    throw new errors.CertFingerprintError(
      url,
      null,
      "the request failed; check that the daemon is running at this address",
      { cause: error },
    );
  }

  if (response.status === 404) {
    await response.body?.cancel();
    return null;
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new errors.CertFingerprintError(
      url,
      response.status,
      `the endpoint answered HTTP ${response.status}; check the daemon's log`,
    );
  }

  try {
    return { body: await response.json() };
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }
    throw new errors.CertFingerprintError(
      url,
      null,
      "the answer is not JSON; check that baseUrl points at a noskills daemon",
      { cause: error },
    );
  }
}

/**
 * Return the fingerprint cached for the daemon at `baseUrl`, or fetch it with
 * fetchAndPinCertFingerprint when there is none or IndexedDB is unavailable.
 * Use this on reconnect to avoid a round-trip when the cert is still valid;
 * attachSession refetches by itself when a cached pin stops matching.
 */
export async function getCertFingerprint(
  baseUrl: string,
  options: CallOptions = {},
): Promise<ArrayBuffer | null> {
  // A malformed baseUrl throws here, so the catch below sees IndexedDB
  // failures only.
  cacheKey(baseUrl);

  let cached: string | null;
  try {
    cached = await loadCertFingerprint(baseUrl);
  } catch {
    // IndexedDB is unavailable (non-browser runtime or private browsing), so
    // fetch the fingerprint live.
    cached = null;
  }

  // An entry that does not parse counts as none; the fetch replaces it.
  const bytes = cached === null ? null : parseFingerprint(cached);
  if (bytes !== null) {
    return bytes.buffer;
  }
  return await fetchAndPinCertFingerprint(baseUrl, options);
}

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Cert fingerprint helpers for noskills-client.
 *
 * Fetches GET /api/cert-fingerprint (unauthenticated) and caches the result in
 * IndexedDB under key "active" so WebTransport clients can pin the self-signed
 * leaf cert via serverCertificateHashes. This bypasses OS CA trust entirely,
 * which is the only option on iOS Safari 16.4+ for PWA mode.
 *
 * When the daemon emits a {type:"cert_rotating", newFingerprint} event the caller
 * should call storeCertFingerprint() with the new value then reconnect.
 *
 * @module
 */

const DB_NAME = "noskills-cert";
const DB_STORE = "fingerprints";
const ACTIVE_KEY = "active";

// =============================================================================
// IndexedDB helpers
// =============================================================================

function openCertDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Persist a hex fingerprint string to IndexedDB. */
export async function storeCertFingerprint(fingerprint: string): Promise<void> {
  const db = await openCertDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    const req = tx.objectStore(DB_STORE).put(fingerprint, ACTIVE_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  db.close();
}

/** Load the stored hex fingerprint from IndexedDB. Returns null if absent. */
export async function loadCertFingerprint(): Promise<string | null> {
  const db = await openCertDB();
  const result = await new Promise<string | undefined>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).get(ACTIVE_KEY);
    req.onsuccess = () => resolve(req.result as string | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result ?? null;
}

// =============================================================================
// Fetch from daemon
// =============================================================================

interface FingerprintResponse {
  fingerprint: string;
}

/**
 * Fetch the current daemon TLS fingerprint from GET /api/cert-fingerprint.
 * Stores it in IndexedDB and returns it as an ArrayBuffer for WebTransport.
 * Returns null when the daemon uses mkcert (no fingerprint endpoint needed).
 */
export async function fetchAndPinCertFingerprint(
  baseUrl: string,
): Promise<ArrayBuffer | null> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/cert-fingerprint`;

  let resp: Response;
  try {
    resp = await fetch(url);
  } catch {
    return null;
  }

  if (!resp.ok) {
    return null;
  }

  let body: FingerprintResponse;
  try {
    body = await resp.json() as FingerprintResponse;
  } catch {
    return null;
  }

  if (!body.fingerprint) {
    return null;
  }

  await storeCertFingerprint(body.fingerprint).catch(() => {});
  return hexToArrayBuffer(body.fingerprint);
}

/**
 * Attempt to load from IndexedDB first; fall back to fetching from daemon.
 * Use this on reconnect to avoid a round-trip when the cert is still valid.
 */
export async function getCertFingerprint(
  baseUrl: string,
): Promise<ArrayBuffer | null> {
  try {
    const cached = await loadCertFingerprint();
    if (cached) {
      return hexToArrayBuffer(cached);
    }
  } catch {
    // IndexedDB unavailable (non-browser or private-browsing restriction) — fetch live
  }
  return fetchAndPinCertFingerprint(baseUrl);
}

// =============================================================================
// Helpers
// =============================================================================

function hexToArrayBuffer(hex: string): ArrayBuffer {
  // Remove any colons or spaces (display formats)
  const clean = hex.replace(/[:\s]/g, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes.buffer;
}

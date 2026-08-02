// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Origin and token guards for the noskills web server.
 *
 * Binding to 127.0.0.1 is not an authorization boundary. WebSockets are exempt
 * from the same-origin policy: any page the developer visits while `noskills
 * web` is running can open `ws://localhost:<port>/mux` and drive the
 * multiplexer. Form posts are likewise cross-origin-reachable. Both therefore
 * need an explicit check.
 *
 * Two independent guards, because each covers the other's gap:
 *
 *  - **Origin allowlist** stops a browser page on another origin. It cannot
 *    stop a non-browser client, which sets any Origin it likes.
 *  - **Per-process token** stops any client that has not read the dashboard
 *    HTML. It is minted per run and never persisted.
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";

/** Query-string parameter carrying the token on the WebSocket upgrade. */
export const TOKEN_QUERY_PARAM = "token";

/** Header carrying the token on mutating REST calls. */
export const TOKEN_HEADER = "x-noskills-token";

/**
 * Mint a per-process token.
 *
 * 32 bytes from the CSPRNG, hex-encoded. Regenerated on every start, so a
 * token leaked from one session is useless against the next.
 */
export const createToken = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

/** Constant-time string comparison, to keep the token off a timing side channel. */
const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return diff === 0;
};

/**
 * Build the set of origins the server answers to.
 *
 * Only loopback on the port we are actually listening on. `localhost` and the
 * two loopback literals are distinct origins to a browser, so all three are
 * listed; anything else -- including a LAN address for the same server -- is
 * rejected.
 */
export const allowedOrigins = (port: number): ReadonlySet<string> =>
  new Set([
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    `http://[::1]:${port}`,
  ]);

/**
 * Check a request's Origin.
 *
 * A missing Origin is allowed: non-browser clients (curl, the CLI's own
 * fetches) omit it, and they are not the threat this guard addresses -- the
 * token is. Every browser-issued cross-origin request *does* carry one, which
 * is what makes the check effective where it matters.
 */
export const isOriginAllowed = (
  request: Request,
  port: number,
): boolean => {
  const origin = request.headers.get("origin");

  if (origin === null || origin === "") {
    return true;
  }

  return allowedOrigins(port).has(origin);
};

/** Check the token supplied as a query parameter (WebSocket upgrade). */
export const hasValidQueryToken = (
  request: Request,
  expected: string,
): boolean => {
  const supplied = new URL(request.url).searchParams.get(TOKEN_QUERY_PARAM);

  return supplied !== null && timingSafeEqual(supplied, expected);
};

/** Check the token supplied as a header (mutating REST). */
export const hasValidHeaderToken = (
  request: Request,
  expected: string,
): boolean => {
  const supplied = request.headers.get(TOKEN_HEADER);

  return supplied !== null && timingSafeEqual(supplied, expected);
};

/**
 * Reject a request whose body is a CSRF-simple content type.
 *
 * `application/x-www-form-urlencoded`, `multipart/form-data` and `text/plain`
 * are the three types an HTML form can post cross-origin without a preflight.
 * Requiring JSON forces a preflight, which the Origin check then fails.
 */
export const hasJsonContentType = (request: Request): boolean => {
  const contentType = request.headers.get("content-type") ?? "";

  return contentType.split(";")[0]?.trim().toLowerCase() ===
    "application/json";
};

/** 403 with a short reason; the body is deliberately uninformative. */
export const forbidden = (reason: string): Response =>
  new Response(`Forbidden: ${reason}`, { status: 403 });

/**
 * Read a token supplied by the environment, if any.
 *
 * Lets a trusted external tool drive the server without scraping the dashboard
 * HTML. Absent, a fresh token is minted per process.
 */
export const tokenFromEnv = (): string | undefined => {
  const value = runtime.env.get("NOSKILLS_WEB_TOKEN");

  return value === undefined || value === "" ? undefined : value;
};

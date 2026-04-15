// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * BlueskyClient — thin XRPC HTTP wrapper for the AT Protocol / Bluesky API.
 * Uses @eserstack/httpclient for retry, timeout, rate-limit, and typed errors.
 * All request methods are generic so callers own the response shape.
 */

import * as httpclient from "@eserstack/httpclient";

/** Configuration for BlueskyClient. */
export interface BlueskyClientConfig {
  /** PDS service URL. Defaults to "https://bsky.social". */
  serviceUrl?: string;
}

const DEFAULT_SERVICE_URL = "https://bsky.social";

/** Low-level stateful XRPC client for the Bluesky / AT Protocol API. */
export class BlueskyClient {
  private readonly _client: httpclient.HttpClient;
  private _accessJwt: string | undefined;
  private _did: string | undefined;

  constructor(config: BlueskyClientConfig = {}) {
    this._client = httpclient.createHttpClient({
      baseUrl: `${config.serviceUrl ?? DEFAULT_SERVICE_URL}/xrpc`,
      retry: { maxAttempts: 3, respectRetryAfter: true },
    });
  }

  /** The authenticated user's DID; undefined before login. */
  get did(): string | undefined {
    return this._did;
  }

  /** Set the active JWT session after login or token restore. */
  setSession(accessJwt: string, did: string): void {
    this._accessJwt = accessJwt;
    this._did = did;
  }

  /** Clear the JWT session (logout). */
  clearSession(): void {
    this._accessJwt = undefined;
    this._did = undefined;
  }

  /** Whether the client currently holds a valid JWT session. */
  isAuthenticated(): boolean {
    return this._accessJwt !== undefined;
  }

  private authHeaders(
    authJwt?: string | null,
  ): Record<string, string> {
    if (authJwt === null) {
      // Explicit null = no auth header (unauthenticated requests)
      return {};
    }
    const token = authJwt ?? this._accessJwt;
    if (token !== undefined) {
      return { Authorization: `Bearer ${token}` };
    }
    return {};
  }

  /** GET `serviceUrl/xrpc/{nsid}?{params}` with session auth. */
  async get<T>(nsid: string, params?: Record<string, string>): Promise<T> {
    const resp = await this._client.get<T>(nsid, {
      params,
      headers: this.authHeaders(),
    });
    return resp.data;
  }

  /**
   * POST `serviceUrl/xrpc/{nsid}` with session auth (default).
   * Pass `null` as authJwt to skip the Authorization header (unauthenticated).
   * Pass a specific JWT string to use a custom bearer token (e.g., refresh JWT).
   */
  async post<T>(
    nsid: string,
    body?: unknown,
    authJwt: string | null | undefined = undefined,
  ): Promise<T> {
    const resp = await this._client.post<T>(nsid, {
      body: body !== undefined ? body as Record<string, unknown> : undefined,
      headers: this.authHeaders(authJwt),
    });
    return resp.data;
  }
}

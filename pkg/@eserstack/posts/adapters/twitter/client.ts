// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * TwitterClient — thin HTTP wrapper for X API v2.
 * Uses @eserstack/httpclient for retry, timeout, rate-limit, and typed errors.
 * All request methods are generic so callers own the response shape.
 */

import * as httpclient from "@eserstack/httpclient";

/** Configuration for TwitterClient. */
export interface TwitterClientConfig {
  /** Base URL for X API v2. Defaults to "https://api.twitter.com/2". */
  baseUrl?: string;
  /** OAuth 2.0 bearer token — injected after the auth flow completes. */
  accessToken?: string;
}

const DEFAULT_BASE_URL = "https://api.twitter.com/2";

/** Low-level stateful HTTP client for the X API. */
export class TwitterClient {
  private readonly _client: httpclient.HttpClient;
  private _accessToken: string | undefined;

  constructor(config: TwitterClientConfig = {}) {
    this._client = httpclient.createHttpClient({
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      retry: { maxAttempts: 3, respectRetryAfter: true },
    });
    this._accessToken = config.accessToken;
  }

  /** Update the bearer token (called after a successful auth exchange). */
  setAccessToken(token: string): void {
    this._accessToken = token;
  }

  /** Clear the bearer token (called on logout or session reset). */
  clearAccessToken(): void {
    this._accessToken = undefined;
  }

  /** Whether the client currently holds a valid access token. */
  isAuthenticated(): boolean {
    return this._accessToken !== undefined;
  }

  private authHeaders(): Record<string, string> {
    if (this._accessToken !== undefined) {
      return { Authorization: `Bearer ${this._accessToken}` };
    }
    return {};
  }

  /** GET `baseUrl + endpoint` with optional query parameters. */
  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const resp = await this._client.get<T>(endpoint, {
      params,
      headers: this.authHeaders(),
    });
    return resp.data;
  }

  /** POST `baseUrl + endpoint` with a JSON body. */
  async post<T>(endpoint: string, body: unknown): Promise<T> {
    const resp = await this._client.post<T>(endpoint, {
      body: body as Record<string, unknown>,
      headers: this.authHeaders(),
    });
    return resp.data;
  }

  /** DELETE `baseUrl + endpoint`. */
  async delete(endpoint: string): Promise<void> {
    await this._client.delete(endpoint, { headers: this.authHeaders() });
  }

  /**
   * POST `baseUrl + endpoint` with an application/x-www-form-urlencoded body.
   * Used exclusively for OAuth token endpoints — no Authorization header sent.
   */
  async postForm<T>(
    endpoint: string,
    params: Record<string, string>,
  ): Promise<T> {
    const resp = await this._client.post<T>(endpoint, {
      body: new URLSearchParams(params),
    });
    return resp.data;
  }
}

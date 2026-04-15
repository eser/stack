// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * AuthProvider — outbound port for authentication flows.
 * Supports both browser-based OAuth (Twitter) and direct credential login (Bluesky).
 */

import type { OAuthTokens } from "../domain/entities/user.ts";

/** Outbound port: authentication lifecycle for any platform. */
export interface AuthProvider {
  /**
   * True if this provider requires a browser redirect (Twitter OAuth 2.0 PKCE).
   * False if it uses direct credential login (Bluesky app password).
   */
  readonly requiresBrowser: boolean;

  /** Whether the provider currently holds a valid access token. */
  isAuthenticated(): boolean;

  /**
   * Generate an authorization URL for browser-based OAuth flows.
   * Throws if requiresBrowser is false.
   */
  getAuthorizationUrl(): Promise<{ url: string; codeVerifier: string }>;

  /**
   * Exchange the authorization code returned by the OAuth callback.
   * Throws if requiresBrowser is false.
   */
  exchangeCode(params: {
    code: string;
    codeVerifier: string;
  }): Promise<OAuthTokens>;

  /**
   * Authenticate directly with credentials (Bluesky handle + app password).
   * Throws if requiresBrowser is true.
   */
  loginWithCredentials(params: {
    identifier: string;
    password: string;
  }): Promise<OAuthTokens>;

  /** Obtain fresh tokens using a stored refresh token / refresh JWT. */
  refreshToken(refreshToken: string): Promise<OAuthTokens>;

  /**
   * Restore a pre-loaded set of tokens (e.g., from a persistent token store).
   * The underlying HTTP client is updated to use the restored access token.
   */
  setTokens(tokens: OAuthTokens): void;

  /** Clear the active session tokens (logout / session reset). */
  clearTokens(): void;
}

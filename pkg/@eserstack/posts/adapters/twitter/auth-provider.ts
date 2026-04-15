// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * TwitterAuthProvider — OAuth 2.0 Authorization Code Flow with PKCE.
 * Browser-based flow: getAuthorizationUrl() → browser redirect → exchangeCode().
 * Uses Web Crypto API exclusively — no external crypto libraries.
 */

import type { OAuthTokens } from "../../domain/entities/user.ts";
import type { AuthProvider } from "../../application/auth-provider.ts";
import { mapToOAuthTokens } from "./mappers.ts";
import type { TwitterApiOAuthToken } from "./types.ts";
import type { TwitterClient } from "./client.ts";

/** Configuration required to run the Twitter OAuth 2.0 PKCE flow. */
export interface TwitterAuthConfig {
  /** OAuth 2.0 client ID registered in the Twitter Developer Portal. */
  clientId: string;
  /** Redirect URI registered in the Twitter Developer Portal. */
  redirectUri: string;
  /** OAuth scopes to request. Defaults to the minimum set for read/write. */
  scopes?: string[];
}

const TWITTER_AUTH_BASE = "https://twitter.com/i/oauth2/authorize";
const TOKEN_ENDPOINT = "/oauth2/token";
const DEFAULT_SCOPES = [
  "tweet.read",
  "tweet.write",
  "users.read",
  "bookmark.write",
  "offline.access",
];

/** Encode a byte array as a URL-safe base64 string (no padding). */
function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/** Generate a cryptographically random URL-safe string of the given byte length. */
function randomUrlSafe(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/** Derive the PKCE code_challenge from a code_verifier using S256 method. */
async function deriveCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toBase64Url(new Uint8Array(digest));
}

/** Implements AuthProvider using Twitter OAuth 2.0 PKCE browser flow. */
export class TwitterAuthProvider implements AuthProvider {
  readonly requiresBrowser = true;

  private readonly config: TwitterAuthConfig;
  private readonly client: TwitterClient;

  constructor(config: TwitterAuthConfig, client: TwitterClient) {
    this.config = config;
    this.client = client;
  }

  isAuthenticated(): boolean {
    return this.client.isAuthenticated();
  }

  async getAuthorizationUrl(): Promise<{ url: string; codeVerifier: string }> {
    const codeVerifier = randomUrlSafe(64);
    const codeChallenge = await deriveCodeChallenge(codeVerifier);
    const state = randomUrlSafe(16);
    const scopes = this.config.scopes ?? DEFAULT_SCOPES;

    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: scopes.join(" "),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    return {
      url: `${TWITTER_AUTH_BASE}?${params.toString()}`,
      codeVerifier,
    };
  }

  async exchangeCode(params: {
    code: string;
    codeVerifier: string;
  }): Promise<OAuthTokens> {
    const raw = await this.client.postForm<TwitterApiOAuthToken>(
      TOKEN_ENDPOINT,
      {
        grant_type: "authorization_code",
        code: params.code,
        redirect_uri: this.config.redirectUri,
        client_id: this.config.clientId,
        code_verifier: params.codeVerifier,
      },
    );
    const tokens = mapToOAuthTokens(raw);
    this.client.setAccessToken(tokens.accessToken);
    return tokens;
  }

  loginWithCredentials(
    _params: { identifier: string; password: string },
  ): Promise<OAuthTokens> {
    return Promise.reject(
      new Error(
        "Twitter uses browser-based OAuth, not direct credential login.",
      ),
    );
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    const raw = await this.client.postForm<TwitterApiOAuthToken>(
      TOKEN_ENDPOINT,
      {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: this.config.clientId,
      },
    );
    const tokens = mapToOAuthTokens(raw);
    this.client.setAccessToken(tokens.accessToken);
    return tokens;
  }

  /** Restore a pre-loaded access token into the HTTP client. */
  setTokens(tokens: OAuthTokens): void {
    this.client.setAccessToken(tokens.accessToken);
  }

  /** Clear the access token from the HTTP client. */
  clearTokens(): void {
    this.client.clearAccessToken();
  }
}

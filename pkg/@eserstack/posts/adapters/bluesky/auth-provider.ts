// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * BlueskyAuthProvider — direct credential login via AT Protocol app passwords.
 * No browser redirect required: POST createSession → receive JWTs.
 */

import type { OAuthTokens } from "../../domain/entities/user.ts";
import type { AuthProvider } from "../../application/auth-provider.ts";
import type { BlueskySession } from "./types.ts";
import type { BlueskyClient } from "./client.ts";

const CREATE_SESSION = "com.atproto.server.createSession";
const REFRESH_SESSION = "com.atproto.server.refreshSession";

/** Implements AuthProvider using Bluesky handle + app password login. */
export class BlueskyAuthProvider implements AuthProvider {
  readonly requiresBrowser = false;

  private readonly client: BlueskyClient;

  constructor(client: BlueskyClient) {
    this.client = client;
  }

  isAuthenticated(): boolean {
    return this.client.isAuthenticated();
  }

  getAuthorizationUrl(): Promise<{ url: string; codeVerifier: string }> {
    return Promise.reject(
      new Error(
        "Bluesky uses direct credential login, not browser-based OAuth.",
      ),
    );
  }

  exchangeCode(
    _params: { code: string; codeVerifier: string },
  ): Promise<OAuthTokens> {
    return Promise.reject(
      new Error(
        "Bluesky uses direct credential login, not OAuth code exchange.",
      ),
    );
  }

  async loginWithCredentials(params: {
    identifier: string;
    password: string;
  }): Promise<OAuthTokens> {
    const session = await this.client.post<BlueskySession>(
      CREATE_SESSION,
      { identifier: params.identifier, password: params.password },
      null, // no auth header — we're creating the session
    );
    this.client.setSession(session.accessJwt, session.did);
    return {
      accessToken: session.accessJwt,
      refreshToken: session.refreshJwt,
      platformData: { did: session.did },
    };
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    // refreshSession uses the refresh JWT as the bearer token
    const session = await this.client.post<BlueskySession>(
      REFRESH_SESSION,
      undefined,
      refreshToken, // custom bearer = refresh JWT
    );
    this.client.setSession(session.accessJwt, session.did);
    return {
      accessToken: session.accessJwt,
      refreshToken: session.refreshJwt,
      platformData: { did: session.did },
    };
  }

  setTokens(tokens: OAuthTokens): void {
    const did = tokens.platformData?.["did"];
    if (did !== undefined) {
      this.client.setSession(tokens.accessToken, did);
    }
    // If DID is missing the session cannot be restored — user must log in again
  }

  clearTokens(): void {
    this.client.clearSession();
  }
}

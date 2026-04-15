// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * PostsConfig — typed configuration for @eserstack/posts.
 *
 * Loads from environment variables and .env files in load-order:
 *   .env → .env.{environment} → .env.local → .env.{environment}.local → process env
 *
 * Use `loadPostsConfig()` at the composition root — never read env vars directly
 * elsewhere in the package.
 *
 * @module
 */

import * as dotenv from "@eserstack/config/dotenv";

// ── Config type ───────────────────────────────────────────────────────────────

export type PostsConfig = {
  /** Current environment name (development, production, test, …). */
  readonly env: string;

  readonly twitter: {
    /** OAuth 2.0 client ID from developer.x.com. Optional — Twitter is
     *  disabled when absent. */
    readonly clientId: string | undefined;
    /** OAuth 2.0 client secret. Used in confidential-client flows. */
    readonly clientSecret: string | undefined;
    /** OAuth callback URL. Default: http://127.0.0.1:8080/callback */
    readonly redirectUri: string;
    /** Base URL override for testing against a mock API server. */
    readonly apiBaseUrl: string | undefined;
  };

  readonly bluesky: {
    /** Bluesky PDS host. Default: https://bsky.social */
    readonly pdsHost: string | undefined;
    /** Bluesky account identifier (handle or DID). */
    readonly identifier: string | undefined;
    /** Bluesky app password (generated in account settings). */
    readonly appPassword: string | undefined;
  };

  readonly ai: {
    /** AI provider name. Default: "anthropic" */
    readonly provider: string;
    /** Anthropic API key. Optional — translation feature is disabled when absent. */
    readonly apiKey: string | undefined;
  };

  /** Path to the OAuth token store file. Default: uses $HOME/.eser/posts/tokens.json */
  readonly tokenStorePath: string | undefined;
};

// ── Loader ────────────────────────────────────────────────────────────────────

const DEFAULT_REDIRECT_URI = "http://127.0.0.1:8080/callback";

/**
 * Load @eserstack/posts configuration from environment variables and .env files.
 *
 * Env var mapping:
 *   TWITTER_CLIENT_ID      → twitter.clientId
 *   TWITTER_CLIENT_SECRET  → twitter.clientSecret
 *   TWITTER_REDIRECT_URI   → twitter.redirectUri (default: http://127.0.0.1:8080/callback)
 *   TWITTER_API_BASE_URL   → twitter.apiBaseUrl  (testing override)
 *   BLUESKY_PDS_HOST       → bluesky.pdsHost
 *   BLUESKY_IDENTIFIER     → bluesky.identifier
 *   BLUESKY_APP_PASSWORD   → bluesky.appPassword
 *   AI_PROVIDER            → ai.provider         (default: "anthropic")
 *   ANTHROPIC_API_KEY      → ai.apiKey
 *   POSTS_TOKEN_STORE_PATH → tokenStorePath
 */
export async function loadPostsConfig(): Promise<PostsConfig> {
  const result = await dotenv.configure<PostsConfig>(
    (reader) => {
      // Build the config as a plain object — avoids readonly assignment errors
      // while still producing the correctly-typed PostsConfig.
      const cfg: PostsConfig = {
        env: reader.getCurrentEnv(),
        twitter: {
          clientId: reader.readString("TWITTER_CLIENT_ID"),
          clientSecret: reader.readString("TWITTER_CLIENT_SECRET"),
          redirectUri: reader.readString(
            "TWITTER_REDIRECT_URI",
            DEFAULT_REDIRECT_URI,
          ),
          apiBaseUrl: reader.readString("TWITTER_API_BASE_URL"),
        },
        bluesky: {
          pdsHost: reader.readString("BLUESKY_PDS_HOST"),
          identifier: reader.readString("BLUESKY_IDENTIFIER"),
          appPassword: reader.readString("BLUESKY_APP_PASSWORD"),
        },
        ai: {
          provider: reader.readString("AI_PROVIDER", "anthropic"),
          apiKey: reader.readString("ANTHROPIC_API_KEY"),
        },
        tokenStorePath: reader.readString("POSTS_TOKEN_STORE_PATH"),
      };
      return cfg;
    },
  );

  // configure() returns T | undefined; undefined only if the fn returns void.
  // Our fn always returns a fully-constructed PostsConfig, so this is
  // unreachable in practice — the assertion keeps the return type clean.
  if (result === undefined) {
    throw new Error(
      "loadPostsConfig: configure() returned undefined — this should not happen",
    );
  }

  return result;
}

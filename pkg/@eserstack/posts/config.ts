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
import * as crossRuntime from "@eserstack/standards/cross-runtime";

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

const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]", "::1"];

/**
 * Reads a key from the process environment only, ignoring .env files.
 *
 * .env files are read from the working directory, so any repository the
 * operator runs `eser posts` in can supply them. Keys that decide where
 * credentials are sent or stored must come from the operator's own
 * environment instead.
 */
const readOperatorEnv = (key: string): string | undefined => {
  const value = crossRuntime.runtime.env.get(key);
  return value === undefined || value === "" ? undefined : value;
};

/**
 * Accepts an absolute https URL, or plain http only for a loopback host (local
 * mock servers in tests). Anything else is rejected, so a credential-bearing
 * client never talks cleartext to a remote host.
 */
export const requireServiceUrl = (
  name: string,
  value: string | undefined,
): string | undefined => {
  if (value === undefined) return undefined;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL, got ${value}`);
  }

  const isLoopback = LOOPBACK_HOSTS.includes(url.hostname);
  if (url.protocol === "https:" || (url.protocol === "http:" && isLoopback)) {
    return value;
  }

  throw new Error(
    `${name} must use https:// (http:// is allowed only for loopback hosts), got ${value}`,
  );
};

/**
 * Expands a leading "~/" and requires the token store path to be absolute, so
 * it can never resolve against the working directory.
 */
export const requireTokenStorePath = (
  value: string | undefined,
): string | undefined => {
  if (value === undefined) return undefined;

  const { path } = crossRuntime.runtime;
  const expanded = value === "~" || value.startsWith("~/")
    ? path.join(crossRuntime.getHomedir(), value.slice(1))
    : value;

  if (!path.isAbsolute(expanded)) {
    throw new Error(
      `POSTS_TOKEN_STORE_PATH must be an absolute path (or start with ~/), got ${value}`,
    );
  }

  return expanded;
};

/**
 * Load @eserstack/posts configuration from environment variables and .env files.
 *
 * Env var mapping:
 *   TWITTER_CLIENT_ID      → twitter.clientId
 *   TWITTER_CLIENT_SECRET  → twitter.clientSecret
 *   TWITTER_REDIRECT_URI   → twitter.redirectUri (default: http://127.0.0.1:8080/callback)
 *   TWITTER_API_BASE_URL   → twitter.apiBaseUrl  (testing override, process env only)
 *   BLUESKY_PDS_HOST       → bluesky.pdsHost     (process env only)
 *   BLUESKY_IDENTIFIER     → bluesky.identifier
 *   BLUESKY_APP_PASSWORD   → bluesky.appPassword
 *   AI_PROVIDER            → ai.provider         (default: "anthropic")
 *   ANTHROPIC_API_KEY      → ai.apiKey
 *   POSTS_TOKEN_STORE_PATH → tokenStorePath      (process env only; absolute or ~/)
 *
 * The keys marked "process env only" decide where credentials are sent or
 * stored. They are not read from .env files in the working directory, which a
 * cloned repository controls.
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
          apiBaseUrl: requireServiceUrl(
            "TWITTER_API_BASE_URL",
            readOperatorEnv("TWITTER_API_BASE_URL"),
          ),
        },
        bluesky: {
          pdsHost: requireServiceUrl(
            "BLUESKY_PDS_HOST",
            readOperatorEnv("BLUESKY_PDS_HOST"),
          ),
          identifier: reader.readString("BLUESKY_IDENTIFIER"),
          appPassword: reader.readString("BLUESKY_APP_PASSWORD"),
        },
        ai: {
          provider: reader.readString("AI_PROVIDER", "anthropic"),
          apiKey: reader.readString("ANTHROPIC_API_KEY"),
        },
        tokenStorePath: requireTokenStorePath(
          readOperatorEnv("POSTS_TOKEN_STORE_PATH"),
        ),
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

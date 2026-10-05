// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * wiring.ts — shared composition root for TUI and CLI adapters.
 *
 * Loads typed configuration via `loadPostsConfig()` (which reads from .env
 * files and process environment), then constructs:
 *   - platform connections (Twitter, Bluesky)
 *   - a PostService (application layer)
 *   - an auth map keyed by Platform
 *   - a FileTokenStore for persisting OAuth tokens
 *
 * Configuration keys:
 *   TWITTER_CLIENT_ID      enables Twitter/X (OAuth 2.0 PKCE)
 *   TWITTER_CLIENT_SECRET  client secret of a confidential X client
 *   TWITTER_REDIRECT_URI   OAuth redirect URI (default: http://127.0.0.1:8080/callback)
 *   TWITTER_API_BASE_URL   base URL override for testing
 *   BLUESKY_PDS_HOST       Bluesky PDS host (default: https://bsky.social)
 *   BLUESKY_IDENTIFIER     Bluesky account for `eser posts login`
 *   BLUESKY_APP_PASSWORD   Bluesky app password for `eser posts login`
 *   ANTHROPIC_API_KEY      enables AI-powered translation
 *
 * config.ts documents each key and where it may come from.
 */

import type { AuthProvider } from "../../application/auth-provider.ts";
import type { PostsCtx } from "../../application/context.ts";
import type { PlatformConnection } from "../../application/feed-aggregator.ts";
import * as feedAggregatorMod from "../../application/feed-aggregator.ts";
import * as postServiceMod from "../../application/post-service.ts";
import * as appWiring from "../../application/wiring.ts";
import type { Platform } from "../../domain/values/platform.ts";
import * as twitter from "../twitter/mod.ts";
import * as bluesky from "../bluesky/mod.ts";
import * as anthropic from "../anthropic/mod.ts";
import * as tokenStoreAdapter from "../token-store/mod.ts";
import * as stubs from "../tui/stubs.ts";
import * as cliTriggersMod from "./triggers.ts";
import type { PostsConfig } from "../../config.ts";
import * as config from "../../config.ts";

export interface AppContext {
  config: PostsConfig;
  service: postServiceMod.PostService;
  postsCtx: PostsCtx;
  bound: appWiring.BoundTriggers;
  cliTriggers: cliTriggersMod.CliTriggers;
  auths: Map<Platform, AuthProvider>;
  tokenStore: tokenStoreAdapter.FileTokenStore;
  twitterRedirectUri: string;
}

/** Build the full application context, loading config from env / .env files. */
export async function createAppContext(): Promise<AppContext> {
  const cfg = await config.loadPostsConfig();

  const connections: PlatformConnection[] = [];
  const auths = new Map<Platform, AuthProvider>();

  // ── Twitter ─────────────────────────────────────────────────────────────────
  if (cfg.twitter.clientId !== undefined && cfg.twitter.clientId !== "") {
    const twitterClient = new twitter.TwitterClient(
      cfg.twitter.apiBaseUrl !== undefined
        ? { baseUrl: cfg.twitter.apiBaseUrl }
        : {},
    );
    const twitterAuth = new twitter.TwitterAuthProvider(
      {
        clientId: cfg.twitter.clientId,
        redirectUri: cfg.twitter.redirectUri,
        ...(cfg.twitter.clientSecret !== undefined &&
          { clientSecret: cfg.twitter.clientSecret }),
      },
      twitterClient,
    );
    const twitterApi = new twitter.TwitterSocialApi(twitterClient);
    connections.push({
      platform: "twitter",
      socialApi: twitterApi,
      auth: twitterAuth,
    });
    auths.set("twitter", twitterAuth);
  }

  // ── Bluesky ──────────────────────────────────────────────────────────────────
  const blueskyClient = new bluesky.BlueskyClient(
    cfg.bluesky.pdsHost !== undefined
      ? { serviceUrl: cfg.bluesky.pdsHost }
      : {},
  );
  const blueskyAuth = new bluesky.BlueskyAuthProvider(blueskyClient);
  const blueskyApi = new bluesky.BlueskySocialApi(blueskyClient);
  connections.push({
    platform: "bluesky",
    socialApi: blueskyApi,
    auth: blueskyAuth,
  });
  auths.set("bluesky", blueskyAuth);

  // ── Application layer ────────────────────────────────────────────────────────
  const feedAggregator = new feedAggregatorMod.DefaultFeedAggregator(
    connections,
  );

  // The key goes to the translator directly: a key from a .env file is not in
  // the process environment, where the Anthropic SDK would look for it.
  const translator = cfg.ai.apiKey !== undefined
    ? new anthropic.AnthropicTranslator({ apiKey: cfg.ai.apiKey })
    : stubs.noopTranslator;

  const service = new postServiceMod.PostService(
    connections,
    translator,
    stubs.noopScheduler,
    feedAggregator,
  );

  const tokenStore = new tokenStoreAdapter.FileTokenStore(cfg.tokenStorePath);

  const postsCtx: PostsCtx = { postService: service, tokenStore, auths };
  const bound = appWiring.createBoundTriggers(postsCtx);
  const cliTriggers = cliTriggersMod.createCliTriggers(bound);

  return {
    config: cfg,
    service,
    postsCtx,
    bound,
    cliTriggers,
    auths,
    tokenStore,
    twitterRedirectUri: cfg.twitter.redirectUri,
  };
}

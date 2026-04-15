// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Config validation for @eserstack/posts.
 *
 * Call `validateConfig(cfg)` right after `loadPostsConfig()` in the
 * composition root. Surface a clear error message rather than failing
 * later with an obscure API 401 or missing-field crash.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import type { PostsConfig } from "./config.ts";

// ── Error type ────────────────────────────────────────────────────────────────

export type ConfigValidationError = {
  readonly code: "CONFIG_INVALID";
  readonly missing: readonly string[];
  readonly message: string;
};

// ── Validator ─────────────────────────────────────────────────────────────────

/**
 * Validate that at least one platform has sufficient credentials.
 *
 * Rules:
 *  - Twitter requires `clientId` to be usable.
 *  - Bluesky requires both `identifier` and `appPassword` to be usable.
 *  - At least one platform must be configured.
 *
 * Returns `ok(config)` when valid.
 * Returns `fail(ConfigValidationError)` listing missing fields when not.
 */
export function validateConfig(
  cfg: PostsConfig,
): results.Result<PostsConfig, ConfigValidationError> {
  const missing: string[] = [];

  const hasTwitter = Boolean(cfg.twitter.clientId);
  const hasBluesky = Boolean(cfg.bluesky.identifier && cfg.bluesky.appPassword);

  if (!hasTwitter && !hasBluesky) {
    if (!cfg.twitter.clientId) {
      missing.push("TWITTER_CLIENT_ID");
    }
    if (!cfg.bluesky.identifier) {
      missing.push("BLUESKY_IDENTIFIER");
    }
    if (!cfg.bluesky.appPassword) {
      missing.push("BLUESKY_APP_PASSWORD");
    }
  }

  if (missing.length > 0) {
    return results.fail({
      code: "CONFIG_INVALID",
      missing,
      message:
        `Missing required configuration — set at least one platform's credentials: ${
          missing.join(", ")
        }`,
    });
  }

  return results.ok(cfg);
}

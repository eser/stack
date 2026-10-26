// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * TokenStore — outbound port for persisting and retrieving OAuth tokens,
 * keyed by platform so Twitter and Bluesky sessions are stored independently.
 */

import type { OAuthTokens } from "../domain/entities/user.ts";
import type { Platform } from "../domain/values/platform.ts";

/** Outbound port: platform-keyed OAuth token persistence. */
export interface TokenStore {
  /** Load the previously saved tokens for the given platform, or null if none exist. */
  load(platform: Platform): Promise<OAuthTokens | null>;
  /** Persist tokens for the given platform for future sessions. */
  save(platform: Platform, tokens: OAuthTokens): Promise<void>;
  /** Remove any persisted tokens for the given platform (logout). */
  clear(platform: Platform): Promise<void>;
}

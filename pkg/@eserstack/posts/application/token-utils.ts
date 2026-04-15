// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Token expiry utilities — pure functions, no side effects.
 * Used by withFreshTokens to decide whether to refresh before an API call.
 */

import type { OAuthTokens } from "../domain/entities/user.ts";

/** Buffer before expiry within which tokens are considered expired (default: 60 s). */
const DEFAULT_BUFFER_MS = 60_000;

/**
 * Returns true if the access token is expired or will expire within `bufferMs`.
 * Tokens without an `expiresAt` field are treated as non-expiring.
 */
export function isTokenExpired(
  tokens: OAuthTokens,
  bufferMs: number = DEFAULT_BUFFER_MS,
): boolean {
  if (tokens.expiresAt === undefined) return false;
  return tokens.expiresAt.getTime() <= Date.now() + bufferMs;
}

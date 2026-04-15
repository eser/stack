// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * User entity — represents an authenticated social platform account.
 * Tokens are optional because an unauthenticated profile view is also valid.
 */

import type { Handle } from "../values/handle.ts";
import type { Platform } from "../values/platform.ts";

/** Subscription tier for a social platform account. */
export type SubscriptionTier = "free" | "premium" | "premium_plus" | "business";

/** OAuth tokens used to act on behalf of a user. */
export interface OAuthTokens {
  /** Bearer / access JWT for API requests. */
  accessToken: string;
  /** OAuth 2.0 refresh token (Twitter) or refresh JWT (Bluesky). */
  refreshToken?: string;
  /** UTC timestamp after which the access token is no longer valid. */
  expiresAt?: Date;
  /**
   * Platform-specific auxiliary data that must survive token persistence.
   * Bluesky: { did: "did:plc:..." } — the DID is needed to restore the session.
   */
  platformData?: Record<string, string>;
}

/** A social platform user as understood by the domain. */
export interface User {
  /** Platform-assigned identifier (Twitter numeric ID or Bluesky DID). */
  id: string;
  /** The user's @handle (without the "@" prefix). */
  handle: Handle;
  /** Human-readable display name shown on the profile. */
  displayName: string;
  /** Which platform this user belongs to. */
  platform: Platform;
  /** The user's subscription tier; defaults to "free" when not known. */
  subscriptionTier: SubscriptionTier;
  /** OAuth credentials; present only when the user is authenticated. */
  tokens?: OAuthTokens;
}

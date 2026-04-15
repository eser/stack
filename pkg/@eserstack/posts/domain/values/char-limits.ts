// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * char-limits.ts — character limit rules per platform and subscription tier.
 *
 * The domain owns these rules so that every adapter (TUI, CLI, web) enforces
 * the same limits without repeating the logic.
 */

import type { Platform } from "./platform.ts";
import type { SubscriptionTier } from "../entities/user.ts";

/** Context needed to determine the effective character limit for a post. */
export interface CharacterLimitContext {
  platform: Platform;
  subscriptionTier: SubscriptionTier;
}

/**
 * Platform-specific character limits keyed by subscription tier.
 * Values are the maximum number of characters allowed per post.
 */
const LIMITS:
  & Record<Platform, Partial<Record<SubscriptionTier, number>>>
  & Record<string, Partial<Record<SubscriptionTier, number>>> = {
    twitter: {
      free: 280,
      premium: 280,
      premium_plus: 25_000,
      business: 25_000,
    },
    bluesky: {
      free: 300,
      premium: 300,
      premium_plus: 300,
      business: 300,
    },
  };

/**
 * Returns the character limit for a given platform + tier combination.
 * Falls back to 280 when the combination is not explicitly defined.
 */
export function getCharacterLimit(context: CharacterLimitContext): number {
  return LIMITS[context.platform]?.[context.subscriptionTier] ?? 280;
}

/**
 * Returns the most restrictive character limit across multiple contexts.
 * Useful when composing a cross-platform post that must fit on every platform.
 *
 * Returns 280 as the safe default when no contexts are provided.
 */
export function getMinCharacterLimit(
  contexts: ReadonlyArray<CharacterLimitContext>,
): number {
  if (contexts.length === 0) return 280;
  return Math.min(...contexts.map(getCharacterLimit));
}

/** Result returned by validatePostLength. */
export interface PostLengthValidation {
  valid: boolean;
  length: number;
  limit: number;
  /** How many characters remain (negative means over the limit). */
  remaining: number;
}

/**
 * Validates whether a post fits within the character limit for a given context.
 */
export function validatePostLength(
  text: string,
  context: CharacterLimitContext,
): PostLengthValidation {
  const limit = getCharacterLimit(context);
  const length = text.length;
  const remaining = limit - length;
  return { valid: remaining >= 0, length, limit, remaining };
}

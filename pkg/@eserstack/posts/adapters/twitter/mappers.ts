// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * mappers.ts — pure functions that transform raw X API responses into
 * domain entities. Nothing here reads from I/O or mutates state.
 */

import type { Post } from "../../domain/entities/post.ts";
import type { DailyUsage, UsageData } from "../../domain/entities/usage.ts";
import type {
  OAuthTokens,
  SubscriptionTier,
  User,
} from "../../domain/entities/user.ts";
import { type Handle, toHandle } from "../../domain/values/handle.ts";
import { toPostId } from "../../domain/values/post-id.ts";
import type {
  TwitterApiOAuthToken,
  TwitterApiTweet,
  TwitterApiUsageResponse,
  TwitterApiUser,
} from "./types.ts";

type DomainReferenceType = "replied_to" | "quoted" | "reposted";

/** Narrow a raw X API reference type to the domain discriminated union. */
function toReferenceType(raw: string): DomainReferenceType | undefined {
  if (raw === "replied_to") return "replied_to";
  if (raw === "quoted") return "quoted";
  if (raw === "retweeted") return "reposted";
  return undefined;
}

/**
 * Map a raw X API tweet to a domain Post entity.
 * The authorHandle must be resolved by the caller (e.g., from expansions).
 */
export function mapToDomainPost(
  raw: TwitterApiTweet,
  authorHandle: Handle,
): Post {
  // deno-lint-ignore camelcase
  const conversationId = raw.conversation_id !== undefined
    // deno-lint-ignore camelcase
    ? toPostId(raw.conversation_id)
    : undefined;
  // deno-lint-ignore camelcase
  const referencedPosts = raw.referenced_tweets?.flatMap((rt) => {
    const type = toReferenceType(rt.type);
    if (type === undefined) return [];
    return [{ type, id: toPostId(rt.id) }];
  });

  return {
    id: toPostId(raw.id),
    text: raw.text,
    authorHandle,
    // deno-lint-ignore camelcase
    createdAt: raw.created_at !== undefined
      ? new Date(raw.created_at)
      : new Date(0),
    platform: "twitter",
    ...(conversationId !== undefined && { conversationId }),
    ...(referencedPosts !== undefined && { referencedPosts }),
  };
}

/** Translate the X API subscription_type string to a domain SubscriptionTier. */
function toSubscriptionTier(raw?: string): SubscriptionTier {
  if (raw === "Premium") return "premium";
  if (raw === "PremiumPlus") return "premium_plus";
  if (raw === "Business") return "business";
  return "free";
}

/** Map a raw X API user to a domain User entity. */
export function mapToDomainUser(raw: TwitterApiUser): User {
  return {
    id: raw.id,
    handle: toHandle(raw.username),
    displayName: raw.name,
    platform: "twitter",
    // deno-lint-ignore camelcase
    subscriptionTier: toSubscriptionTier(raw.subscription_type),
  };
}

/** Map an X API OAuth token response to domain OAuthTokens. */
export function mapToOAuthTokens(raw: TwitterApiOAuthToken): OAuthTokens {
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    expiresAt: raw.expires_in !== undefined
      ? new Date(Date.now() + raw.expires_in * 1000)
      : undefined,
  };
}

/** Map an X API usage response to a domain UsageData entity. */
export function mapToDomainUsage(raw: TwitterApiUsageResponse): UsageData {
  // deno-lint-ignore camelcase
  const appUsages = raw.data?.daily_client_app_usage ?? [];
  const firstApp = appUsages[0];
  // deno-lint-ignore camelcase
  const appName = firstApp?.app_name;

  // Aggregate daily usage across all app entries (usually just one app)
  const dailyMap = new Map<string, number>();
  for (const app of appUsages) {
    for (const day of app.usage ?? []) {
      const dateKey = day.start;
      // deno-lint-ignore camelcase
      const dayCount = (day.usage_types ?? []).reduce(
        (sum, ut) => sum + ut.count,
        0,
      );
      dailyMap.set(dateKey, (dailyMap.get(dateKey) ?? 0) + dayCount);
    }
  }

  const daily: DailyUsage[] = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, callCount]) => ({ date: new Date(dateKey), callCount }));

  const totalCalls = daily.reduce((sum, d) => sum + d.callCount, 0);

  return { appName, daily, totalCalls };
}

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/** Application layer barrel — port interfaces and use-case implementations. */

export type { AuthorizationRequest, AuthProvider } from "./auth-provider.ts";
export { AuthRequiredError } from "./auth-required-error.ts";
export { FanOutPartialError } from "./fan-out-partial-error.ts";
export type { FanOutFailure } from "./fan-out-partial-error.ts";
export type { PostsCtx } from "./context.ts";
export { DefaultFeedAggregator } from "./feed-aggregator.ts";
export type { FeedAggregator, PlatformConnection } from "./feed-aggregator.ts";
/**
 * One handler per use case, each `(input) => Task<Output, Error, PostsCtx>`,
 * with the input types they take.
 */
export * as handlers from "./handlers.ts";
// BoundTriggers takes these inputs, so they are named exports as well.
export type {
  BookmarkPostInput,
  ComposeAllInput,
  ComposeInput,
  GetBookmarksInput,
  GetPostInput,
  GetTimelineInput,
  GetUnifiedTimelineInput,
  GetUsageInput,
  PostThreadInput,
  QuotePostInput,
  RemoveBookmarkInput,
  ReplyInput,
  RepostInput,
  SearchPostsAllInput,
  SearchPostsInput,
  TranslateAndPostInput,
  UndoRepostInput,
} from "./handlers.ts";
export { PostService } from "./post-service.ts";
export type { InboundPostService, PostResult } from "./post-service.ts";
export { restoreSavedTokens } from "./restore-saved-tokens.ts";
export type {
  RestoredTokens,
  TokenRestoreFailure,
} from "./restore-saved-tokens.ts";
export type { ScheduledPost, Scheduler } from "./scheduler.ts";
export type { SocialApi } from "./social-api.ts";
export { ThreadPartialError } from "./thread-post-error.ts";
export type { TokenStore } from "./token-store.ts";
export { isTokenExpired } from "./token-utils.ts";
export type { Translator } from "./translator.ts";
export { withFreshTokens } from "./with-fresh-tokens.ts";
export { createBoundTriggers } from "./wiring.ts";
export type { BoundTriggers } from "./wiring.ts";
// The domain, Result and Task types appear in the signatures above; this
// entry point is published as @eserstack/posts/application, so re-exporting
// them keeps its documented API complete.
export type {
  DailyUsage,
  Handle,
  OAuthTokens,
  Platform,
  Post,
  PostId,
  SubscriptionTier,
  UsageData,
  User,
} from "../domain/mod.ts";
export type { Fail, Ok, Result } from "@eserstack/primitives/results";
export type { Task } from "@eserstack/functions/task";

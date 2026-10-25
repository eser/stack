// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * @eserstack/posts: multi-platform social posting (Twitter/X and Bluesky)
 * built with hexagonal architecture.
 *
 * Public API: domain types, application port interfaces, PostService and the
 * configuration loader. Adapters are not exported here; wire them at the
 * composition root of your application.
 *
 * @module
 */

export {
  AuthRequiredError,
  createBoundTriggers,
  DefaultFeedAggregator,
  FanOutPartialError,
  handlers,
  isTokenExpired,
  PostService,
  restoreSavedTokens,
  ThreadPartialError,
  withFreshTokens,
} from "./application/mod.ts";
export type {
  AuthorizationRequest,
  AuthProvider,
  BookmarkPostInput,
  BoundTriggers,
  ComposeAllInput,
  ComposeInput,
  FanOutFailure,
  FeedAggregator,
  GetBookmarksInput,
  GetPostInput,
  GetTimelineInput,
  GetUnifiedTimelineInput,
  GetUsageInput,
  InboundPostService,
  PlatformConnection,
  PostResult,
  PostsCtx,
  PostThreadInput,
  QuotePostInput,
  RemoveBookmarkInput,
  ReplyInput,
  RepostInput,
  RestoredTokens,
  ScheduledPost,
  Scheduler,
  SearchPostsAllInput,
  SearchPostsInput,
  SocialApi,
  TokenRestoreFailure,
  TokenStore,
  TranslateAndPostInput,
  Translator,
  UndoRepostInput,
} from "./application/mod.ts";
export {
  createThread,
  getCharacterLimit,
  getMinCharacterLimit,
  toHandle,
  toPostId,
  validatePostLength,
} from "./domain/mod.ts";
export type {
  CharacterLimitContext,
  DailyUsage,
  Handle,
  OAuthTokens,
  Platform,
  Post,
  PostId,
  PostLengthValidation,
  SubscriptionTier,
  Thread,
  UsageData,
  User,
} from "./domain/mod.ts";
// The Result and Task types appear in the signatures above; re-exporting
// them keeps the documented public API complete.
export type { Fail, Ok, Result } from "@eserstack/primitives/results";
export type { Task } from "@eserstack/functions/task";
export { loadPostsConfig } from "./config.ts";
export type { PostsConfig } from "./config.ts";
export { validateConfig } from "./config-validation.ts";
export type { ConfigValidationError } from "./config-validation.ts";

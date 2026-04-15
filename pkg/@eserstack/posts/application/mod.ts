// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/** Application layer barrel — port interfaces and use-case implementations. */

export type { AuthProvider } from "./auth-provider.ts";
export { AuthRequiredError } from "./auth-required-error.ts";
export { FanOutPartialError } from "./fan-out-partial-error.ts";
export type { FanOutFailure } from "./fan-out-partial-error.ts";
export type { PostsCtx } from "./context.ts";
export { DefaultFeedAggregator } from "./feed-aggregator.ts";
export type { FeedAggregator, PlatformConnection } from "./feed-aggregator.ts";
export * as handlers from "./handlers.ts";
export { PostService } from "./post-service.ts";
export type { InboundPostService, PostResult } from "./post-service.ts";
export type { ScheduledPost, Scheduler } from "./scheduler.ts";
export type { SocialApi } from "./social-api.ts";
export { ThreadPartialError } from "./thread-post-error.ts";
export type { TokenStore } from "./token-store.ts";
export { isTokenExpired } from "./token-utils.ts";
export type { Translator } from "./translator.ts";
export { withFreshTokens } from "./with-fresh-tokens.ts";
export { createBoundTriggers } from "./wiring.ts";
export type { BoundTriggers } from "./wiring.ts";

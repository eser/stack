// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Test utilities: mock adapter factories and test data factories. Import them
 * from `@eserstack/posts/testing` to test code built on the application layer
 * without a network or a token file.
 *
 * Every mock records its calls and takes per-method overrides, so a test can
 * make one method fail and check what the code under test did next.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import type { Post } from "../domain/entities/post.ts";
import type { OAuthTokens, User } from "../domain/entities/user.ts";
import type { UsageData } from "../domain/entities/usage.ts";
import type { Platform } from "../domain/values/platform.ts";
import * as postIdMod from "../domain/values/post-id.ts";
import * as handleMod from "../domain/values/handle.ts";
import type { SocialApi } from "./social-api.ts";
import type { AuthProvider } from "./auth-provider.ts";
import type { Translator } from "./translator.ts";
import type { ScheduledPost, Scheduler } from "./scheduler.ts";
import type { TokenStore } from "./token-store.ts";
import type { FeedAggregator } from "./feed-aggregator.ts";

// ── Call tracking ─────────────────────────────────────────────────────────────

/** Record of a single method invocation, used in test assertions. */
export interface CallRecord {
  /** The name of the method that was called. */
  method: string;
  /** The arguments it was called with, in order. */
  args: unknown[];
}

// ── Test data factories ───────────────────────────────────────────────────────

/** Build a Post with deterministic defaults. */
export function createTestPost(overrides?: Partial<Post>): Post {
  return {
    id: postIdMod.toPostId("test-post-1"),
    text: "Test post content",
    authorHandle: handleMod.toHandle("testuser"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    platform: "twitter",
    ...overrides,
  };
}

/** Build a User with deterministic defaults. */
export function createTestUser(overrides?: Partial<User>): User {
  return {
    id: "test-user-1",
    handle: handleMod.toHandle("testuser"),
    displayName: "Test User",
    platform: "twitter",
    subscriptionTier: "free",
    ...overrides,
  };
}

/** Build OAuthTokens with deterministic defaults. */
export function createTestTokens(
  overrides?: Partial<OAuthTokens>,
): OAuthTokens {
  return {
    accessToken: "test-access-token",
    refreshToken: "test-refresh-token",
    expiresAt: new Date("2027-01-01T00:00:00Z"),
    ...overrides,
  };
}

// ── Mock SocialApi ────────────────────────────────────────────────────────────

/** A SocialApi mock that records every call. */
export interface MockSocialApi extends SocialApi {
  /** Every call made to the mock, in order. */
  readonly calls: CallRecord[];
}

/**
 * Create a SocialApi mock. Each method records its call, then runs the
 * override for that method when one is given, or returns test data.
 *
 * @param overrides Methods to replace, such as a createPost that rejects.
 */
export function createMockSocialApi(
  overrides?: Partial<SocialApi>,
): MockSocialApi {
  const calls: CallRecord[] = [];
  const emptyUsage: UsageData = {
    appName: undefined,
    daily: [],
    totalCalls: 0,
  };

  return {
    calls,
    createPost(params) {
      calls.push({ method: "createPost", args: [params] });
      return (
        overrides?.createPost?.(params) ??
        Promise.resolve({ id: postIdMod.toPostId("new-post-1") })
      );
    },
    deletePost(id) {
      calls.push({ method: "deletePost", args: [id] });
      return overrides?.deletePost?.(id) ?? Promise.resolve();
    },
    getTimeline(params) {
      calls.push({ method: "getTimeline", args: [params] });
      return (
        overrides?.getTimeline?.(params) ?? Promise.resolve([createTestPost()])
      );
    },
    getMe() {
      calls.push({ method: "getMe", args: [] });
      return overrides?.getMe?.() ?? Promise.resolve(createTestUser());
    },
    getPost(id) {
      calls.push({ method: "getPost", args: [id] });
      return (
        overrides?.getPost?.(id) ?? Promise.resolve(createTestPost({ id }))
      );
    },
    replyToPost(params) {
      calls.push({ method: "replyToPost", args: [params] });
      return (
        overrides?.replyToPost?.(params) ??
        Promise.resolve({ id: postIdMod.toPostId("reply-post-1") })
      );
    },
    postThread(params) {
      calls.push({ method: "postThread", args: [params] });
      return (
        overrides?.postThread?.(params) ??
        Promise.resolve(results.ok({ posts: [createTestPost()] }))
      );
    },
    getConversation(params) {
      calls.push({ method: "getConversation", args: [params] });
      return overrides?.getConversation?.(params) ?? Promise.resolve([]);
    },
    getUsage() {
      calls.push({ method: "getUsage", args: [] });
      return overrides?.getUsage?.() ?? Promise.resolve(emptyUsage);
    },
    repost(id) {
      calls.push({ method: "repost", args: [id] });
      return overrides?.repost?.(id) ?? Promise.resolve();
    },
    undoRepost(id) {
      calls.push({ method: "undoRepost", args: [id] });
      return overrides?.undoRepost?.(id) ?? Promise.resolve();
    },
    quotePost(params) {
      calls.push({ method: "quotePost", args: [params] });
      return (
        overrides?.quotePost?.(params) ??
        Promise.resolve({ id: postIdMod.toPostId("mock-quote-id") })
      );
    },
    searchPosts(params) {
      calls.push({ method: "searchPosts", args: [params] });
      return (
        overrides?.searchPosts?.(params) ??
        Promise.resolve([createTestPost({ text: "search result" })])
      );
    },
    bookmarkPost(id) {
      calls.push({ method: "bookmarkPost", args: [id] });
      return overrides?.bookmarkPost?.(id) ?? Promise.resolve();
    },
    removeBookmark(id) {
      calls.push({ method: "removeBookmark", args: [id] });
      return overrides?.removeBookmark?.(id) ?? Promise.resolve();
    },
    getBookmarks(params) {
      calls.push({ method: "getBookmarks", args: [params] });
      return (
        overrides?.getBookmarks?.(params) ??
        Promise.resolve([createTestPost({ text: "bookmarked" })])
      );
    },
  };
}

// ── Mock AuthProvider ─────────────────────────────────────────────────────────

/** An AuthProvider mock that records every call. */
export interface MockAuthProvider extends AuthProvider {
  /** Every call made to the mock, in order. */
  readonly calls: CallRecord[];
}

/** The parts of an AuthProvider mock that a test can replace. */
export interface MockAuthProviderOverrides {
  /** Whether the login opens a browser; false when left out. */
  requiresBrowser?: boolean;
  /** Replaces isAuthenticated, which returns true when left out. */
  isAuthenticated?: () => boolean;
  /** Replaces getAuthorizationUrl. */
  getAuthorizationUrl?: AuthProvider["getAuthorizationUrl"];
  /** Replaces exchangeCode. */
  exchangeCode?: AuthProvider["exchangeCode"];
  /** Replaces loginWithCredentials. */
  loginWithCredentials?: AuthProvider["loginWithCredentials"];
  /** Replaces refreshToken. */
  refreshToken?: AuthProvider["refreshToken"];
  /** Runs after setTokens records its call. */
  setTokens?: AuthProvider["setTokens"];
  /** Runs after clearTokens records its call. */
  clearTokens?: AuthProvider["clearTokens"];
}

/**
 * Create an AuthProvider mock that is logged in and returns test tokens,
 * unless an override says otherwise.
 *
 * @param overrides Methods or values to replace.
 */
export function createMockAuthProvider(
  overrides?: MockAuthProviderOverrides,
): MockAuthProvider {
  const calls: CallRecord[] = [];

  return {
    calls,
    get requiresBrowser() {
      return overrides?.requiresBrowser ?? false;
    },
    isAuthenticated() {
      calls.push({ method: "isAuthenticated", args: [] });
      return overrides?.isAuthenticated?.() ?? true;
    },
    getAuthorizationUrl() {
      calls.push({ method: "getAuthorizationUrl", args: [] });
      return (
        overrides?.getAuthorizationUrl?.() ??
        Promise.resolve({
          url: "https://auth.example.com/authorize?state=test",
          codeVerifier: "test-verifier",
          state: "test",
        })
      );
    },
    exchangeCode(params) {
      calls.push({ method: "exchangeCode", args: [params] });
      return (
        overrides?.exchangeCode?.(params) ?? Promise.resolve(createTestTokens())
      );
    },
    loginWithCredentials(params) {
      calls.push({ method: "loginWithCredentials", args: [params] });
      return (
        overrides?.loginWithCredentials?.(params) ??
        Promise.resolve(createTestTokens())
      );
    },
    refreshToken(token) {
      calls.push({ method: "refreshToken", args: [token] });
      return (
        overrides?.refreshToken?.(token) ?? Promise.resolve(createTestTokens())
      );
    },
    setTokens(tokens) {
      calls.push({ method: "setTokens", args: [tokens] });
      overrides?.setTokens?.(tokens);
    },
    clearTokens() {
      calls.push({ method: "clearTokens", args: [] });
      overrides?.clearTokens?.();
    },
  };
}

// ── Mock Translator ───────────────────────────────────────────────────────────

/** A Translator mock that records every call. */
export interface MockTranslator extends Translator {
  /** Every call made to the mock, in order. */
  readonly calls: CallRecord[];
}

/**
 * Create a Translator mock that returns the text prefixed with
 * `[translated] `, unless an override says otherwise.
 *
 * @param overrides Methods to replace, such as a translate that fails.
 */
export function createMockTranslator(
  overrides?: Partial<Translator>,
): MockTranslator {
  const calls: CallRecord[] = [];

  return {
    calls,
    translate(params) {
      calls.push({ method: "translate", args: [params] });
      return (
        overrides?.translate?.(params) ??
        Promise.resolve(results.ok(`[translated] ${params.text}`))
      );
    },
  };
}

// ── Mock Scheduler ────────────────────────────────────────────────────────────

/** A Scheduler mock that records every call. */
export interface MockScheduler extends Scheduler {
  /** Every call made to the mock, in order. */
  readonly calls: CallRecord[];
}

/**
 * Create a Scheduler mock that accepts every post and has nothing pending,
 * unless an override says otherwise.
 *
 * @param overrides Methods to replace.
 */
export function createMockScheduler(
  overrides?: Partial<Scheduler>,
): MockScheduler {
  const calls: CallRecord[] = [];
  const pending: ScheduledPost[] = [];

  return {
    calls,
    schedule(params) {
      calls.push({ method: "schedule", args: [params] });
      return (
        overrides?.schedule?.(params) ??
        Promise.resolve({ id: "scheduled-job-1" })
      );
    },
    cancel(id) {
      calls.push({ method: "cancel", args: [id] });
      return overrides?.cancel?.(id) ?? Promise.resolve();
    },
    listPending() {
      calls.push({ method: "listPending", args: [] });
      return overrides?.listPending?.() ?? Promise.resolve(pending);
    },
  };
}

// ── Mock TokenStore ───────────────────────────────────────────────────────────

/** An in-memory TokenStore that records every call. */
export interface MockTokenStore extends TokenStore {
  /** Every call made to the store, in order. */
  readonly calls: CallRecord[];
  /** The saved tokens by platform; set an entry to give a test saved tokens. */
  readonly store: Map<Platform, OAuthTokens>;
}

/** Create an empty in-memory TokenStore. */
export function createMockTokenStore(): MockTokenStore {
  const calls: CallRecord[] = [];
  const store = new Map<Platform, OAuthTokens>();

  return {
    calls,
    store,
    load(platform) {
      calls.push({ method: "load", args: [platform] });
      return Promise.resolve(store.get(platform) ?? null);
    },
    save(platform, tokens) {
      calls.push({ method: "save", args: [platform, tokens] });
      store.set(platform, tokens);
      return Promise.resolve();
    },
    clear(platform) {
      calls.push({ method: "clear", args: [platform] });
      store.delete(platform);
      return Promise.resolve();
    },
  };
}

// ── Mock FeedAggregator ───────────────────────────────────────────────────────

/** A FeedAggregator mock that records every call. */
export interface MockFeedAggregator extends FeedAggregator {
  /** Every call made to the mock, in order. */
  readonly calls: CallRecord[];
}

/**
 * Create a FeedAggregator mock that returns one test post, unless an override
 * says otherwise.
 *
 * @param overrides Methods to replace.
 */
export function createMockFeedAggregator(
  overrides?: Partial<FeedAggregator>,
): MockFeedAggregator {
  const calls: CallRecord[] = [];

  return {
    calls,
    getUnifiedTimeline(params) {
      calls.push({ method: "getUnifiedTimeline", args: [params] });
      return (
        overrides?.getUnifiedTimeline?.(params) ??
        Promise.resolve([createTestPost()])
      );
    },
  };
}

// ── Referenced types ──────────────────────────────────────────────────────────

// The mocks above implement these ports and return these domain types; this
// module is published as @eserstack/posts/testing, so re-exporting them keeps
// its documented API complete.
export type {
  AuthorizationRequest,
  AuthProvider,
  FeedAggregator,
  ScheduledPost,
  Scheduler,
  SocialApi,
  TokenStore,
  Translator,
} from "./mod.ts";
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

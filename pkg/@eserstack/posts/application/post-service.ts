// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * PostService — inbound port interface + multi-platform application service.
 * Accepts a collection of platform connections and routes write operations to
 * the correct SocialApi. Reads (timeline) go through FeedAggregator.
 *
 * All methods return Promise<Result<T, Error>> for @eserstack/functions compatibility.
 * Internally uses run() + yield* do-notation for composing sequential operations.
 */

import * as results from "@eserstack/primitives/results";
import * as fn from "@eserstack/functions";
import type { Post } from "../domain/entities/post.ts";
import type { UsageData } from "../domain/entities/usage.ts";
import type { Platform } from "../domain/values/platform.ts";
import type { PostId } from "../domain/values/post-id.ts";
import type { FeedAggregator, PlatformConnection } from "./feed-aggregator.ts";
import type { Scheduler } from "./scheduler.ts";
import type { SocialApi } from "./social-api.ts";
import type { Translator } from "./translator.ts";
import * as defaults from "./defaults.ts";

/** Per-platform result from a cross-platform operation. */
export interface PostResult {
  /** The platform this entry is for. */
  platform: Platform;
  /** The published post, when the platform succeeded. */
  post?: Post;
  /** Why the platform failed, when it did. */
  error?: Error;
}

/** Inbound port: public operations exposed to UI adapters (TUI, web, CLI). */
export interface InboundPostService {
  /** Publish a post immediately. Defaults to the first configured platform. */
  composePost(
    text: string,
    platform?: Platform,
  ): Promise<results.Result<Post, Error>>;
  /**
   * Cross-post the same text to all configured platforms, one after another in
   * configuration order. Returns one entry per platform, in that order.
   */
  composePostToAll(text: string): Promise<results.Result<PostResult[], Error>>;
  /** Translate text, then publish. */
  translateAndPost(params: {
    text: string;
    from: string;
    to: string;
    platform?: Platform;
  }): Promise<results.Result<Post, Error>>;
  /** Queue a post for delivery at a future time. */
  schedulePost(params: {
    text: string;
    scheduledAt: Date;
    platform?: Platform;
  }): Promise<results.Result<void, Error>>;
  /** Get unified timeline from all authenticated platforms, newest first. */
  getUnifiedTimeline(params?: {
    maxResultsPerPlatform?: number;
  }): Promise<results.Result<Post[], Error>>;
  /** Get timeline from a specific (or default) platform. */
  getTimeline(params?: {
    maxResults?: number;
    platform?: Platform;
  }): Promise<results.Result<Post[], Error>>;
  /** Fetch a single post by ID from the given platform. */
  getPost(id: PostId, platform: Platform): Promise<results.Result<Post, Error>>;
  /** Post a reply. The platform is inferred from inReplyToPost.platform. */
  replyToPost(params: {
    text: string;
    inReplyToPost: Post;
  }): Promise<results.Result<Post, Error>>;
  /**
   * Post a thread to the given platform.
   * Returns Fail with ThreadPartialError on partial failure.
   */
  postThread(
    texts: ReadonlyArray<string>,
    platform?: Platform,
  ): Promise<results.Result<Post[], Error>>;
  /** Translate text, then post as a reply. Platform inferred from inReplyToPost. */
  translateAndReply(params: {
    text: string;
    inReplyToPost: Post;
    from: string;
    to: string;
  }): Promise<results.Result<Post, Error>>;
  /** Retrieve API usage data for a platform. */
  getUsage(platform?: Platform): Promise<results.Result<UsageData, Error>>;

  /** Repost (share) a post on the given platform without commentary. */
  repost(params: {
    id: PostId;
    platform: Platform;
  }): Promise<results.Result<void, Error>>;
  /** Remove a repost on the given platform. */
  undoRepost(params: {
    id: PostId;
    platform: Platform;
  }): Promise<results.Result<void, Error>>;
  /**
   * Quote post — share a post with your own commentary on the given platform.
   * Returns the newly created Post including the referencedPosts entry.
   */
  quotePost(params: {
    text: string;
    quotedPostId: PostId;
    platform: Platform;
  }): Promise<results.Result<Post, Error>>;

  /** Search for posts on a specific platform. */
  searchPosts(params: {
    query: string;
    maxResults?: number;
    platform: Platform;
  }): Promise<results.Result<Post[], Error>>;
  /**
   * Search across all configured platforms and merge the results, newest
   * first. A platform that fails is left out. `maxResultsPerPlatform`
   * defaults to `DEFAULT_MAX_RESULTS_PER_PLATFORM` (10).
   */
  searchPostsAll(params: {
    query: string;
    maxResultsPerPlatform?: number;
  }): Promise<results.Result<Post[], Error>>;
  /** Add a post to the authenticated user's bookmarks. */
  bookmarkPost(params: {
    id: PostId;
    platform: Platform;
  }): Promise<results.Result<void, Error>>;
  /** Remove a post from bookmarks. */
  removeBookmark(params: {
    id: PostId;
    platform: Platform;
  }): Promise<results.Result<void, Error>>;
  /** List bookmarked posts for a platform. */
  getBookmarks(params: {
    platform: Platform;
    maxResults?: number;
  }): Promise<results.Result<Post[], Error>>;
}

/** Concrete use-case coordinator for multi-platform posting. */
export class PostService implements InboundPostService {
  readonly #apis: Map<Platform, SocialApi>;
  readonly #feedAggregator: FeedAggregator;
  readonly #translator: Translator;
  readonly #scheduler: Scheduler;

  /**
   * Create the service over the given platform connections.
   *
   * @param connections The platforms to route to; the first one is the
   *   default for operations that take an optional platform, and
   *   cross-platform operations visit them in this order.
   * @param translator Translates text for the translate operations.
   * @param scheduler Stores posts to send later.
   * @param feedAggregator Merges timelines across platforms.
   */
  constructor(
    connections: ReadonlyArray<PlatformConnection>,
    translator: Translator,
    scheduler: Scheduler,
    feedAggregator: FeedAggregator,
  ) {
    this.#apis = new Map(connections.map((c) => [c.platform, c.socialApi]));
    this.#feedAggregator = feedAggregator;
    this.#translator = translator;
    this.#scheduler = scheduler;
  }

  #resolveApiWithPlatformResult(
    platform?: Platform,
  ): results.Result<[Platform, SocialApi], Error> {
    if (platform !== undefined) {
      const api = this.#apis.get(platform);
      if (api !== undefined) return results.ok([platform, api]);
      return results.fail(
        new Error(`Platform "${platform}" is not configured.`),
      );
    }
    for (const [p, api] of this.#apis.entries()) {
      return results.ok([p, api]);
    }
    return results.fail(new Error("No platforms are configured."));
  }

  #resolveApiResult(platform?: Platform): results.Result<SocialApi, Error> {
    const r = this.#resolveApiWithPlatformResult(platform);
    return results.map(r, ([, api]) => api);
  }

  composePost(
    text: string,
    platform?: Platform,
  ): Promise<results.Result<Post, Error>> {
    const resolveApiWithPlatformResult =
      this.#resolveApiWithPlatformResult.bind(this);
    return fn.run(async function* () {
      const [resolvedPlatform, api] =
        yield* resolveApiWithPlatformResult(platform);
      const me = yield* await results.fromPromise(api.getMe());
      const { id, platformRef } = yield* await results.fromPromise(
        api.createPost({ text }),
      );
      return {
        id,
        text,
        authorHandle: me.handle,
        createdAt: new Date(),
        platform: resolvedPlatform,
        ...(platformRef !== undefined && { platformRef }),
      };
    });
  }

  async composePostToAll(
    text: string,
  ): Promise<results.Result<PostResult[], Error>> {
    const postResults: PostResult[] = [];
    for (const platform of this.#apis.keys()) {
      // Platforms publish one after another in configuration order, as
      // composePostToAllHandler does with saved tokens, so every wiring sends
      // the posts in the same order.
      // oxlint-disable-next-line no-await-in-loop
      const r = await this.composePost(text, platform);
      postResults.push(
        results.isOk(r)
          ? { platform, post: r.value }
          : { platform, error: r.error },
      );
    }
    return results.ok(postResults);
  }

  translateAndPost(params: {
    text: string;
    from: string;
    to: string;
    platform?: Platform;
  }): Promise<results.Result<Post, Error>> {
    const translator = this.#translator;
    const composePost = this.composePost.bind(this);
    return fn.run(async function* () {
      const translated = yield* await translator.translate({
        text: params.text,
        from: params.from,
        to: params.to,
      });
      return yield* await composePost(translated, params.platform);
    });
  }

  schedulePost(params: {
    text: string;
    scheduledAt: Date;
    platform?: Platform;
  }): Promise<results.Result<void, Error>> {
    const scheduler = this.#scheduler;
    return fn.run(async function* () {
      yield* await results.fromPromise(
        scheduler.schedule({
          text: params.text,
          scheduledAt: params.scheduledAt,
        }),
      );
    });
  }

  getUnifiedTimeline(params?: {
    maxResultsPerPlatform?: number;
  }): Promise<results.Result<Post[], Error>> {
    const feedAggregator = this.#feedAggregator;
    return fn.run(async function* () {
      return yield* await results.fromPromise(
        feedAggregator.getUnifiedTimeline(params),
      );
    });
  }

  getTimeline(params?: {
    maxResults?: number;
    platform?: Platform;
  }): Promise<results.Result<Post[], Error>> {
    const resolveApiResult = this.#resolveApiResult.bind(this);
    return fn.run(async function* () {
      const api = yield* resolveApiResult(params?.platform);
      return yield* await results.fromPromise(
        api.getTimeline({ maxResults: params?.maxResults }),
      );
    });
  }

  getPost(
    id: PostId,
    platform: Platform,
  ): Promise<results.Result<Post, Error>> {
    const resolveApiResult = this.#resolveApiResult.bind(this);
    return fn.run(async function* () {
      const api = yield* resolveApiResult(platform);
      return yield* await results.fromPromise(api.getPost(id));
    });
  }

  replyToPost(params: {
    text: string;
    inReplyToPost: Post;
  }): Promise<results.Result<Post, Error>> {
    const resolveApiResult = this.#resolveApiResult.bind(this);
    return fn.run(async function* () {
      const api = yield* resolveApiResult(params.inReplyToPost.platform);
      const me = yield* await results.fromPromise(api.getMe());
      const { id, platformRef } = yield* await results.fromPromise(
        api.replyToPost(params),
      );
      return {
        id,
        text: params.text,
        authorHandle: me.handle,
        createdAt: new Date(),
        platform: params.inReplyToPost.platform,
        inReplyToId: params.inReplyToPost.id,
        ...(platformRef !== undefined && { platformRef }),
      };
    });
  }

  postThread(
    texts: ReadonlyArray<string>,
    platform?: Platform,
  ): Promise<results.Result<Post[], Error>> {
    const resolveApiResult = this.#resolveApiResult.bind(this);
    return fn.run(async function* () {
      const api = yield* resolveApiResult(platform);
      const result = yield* await api.postThread({ texts });
      return result.posts;
    });
  }

  translateAndReply(params: {
    text: string;
    inReplyToPost: Post;
    from: string;
    to: string;
  }): Promise<results.Result<Post, Error>> {
    const translator = this.#translator;
    const replyToPost = this.replyToPost.bind(this);
    return fn.run(async function* () {
      const translated = yield* await translator.translate({
        text: params.text,
        from: params.from,
        to: params.to,
      });
      return yield* await replyToPost({
        text: translated,
        inReplyToPost: params.inReplyToPost,
      });
    });
  }

  getUsage(platform?: Platform): Promise<results.Result<UsageData, Error>> {
    const resolveApiResult = this.#resolveApiResult.bind(this);
    return fn.run(async function* () {
      const api = yield* resolveApiResult(platform);
      return yield* await results.fromPromise(api.getUsage());
    });
  }

  repost(params: {
    id: PostId;
    platform: Platform;
  }): Promise<results.Result<void, Error>> {
    const resolveApiResult = this.#resolveApiResult.bind(this);
    return fn.run(async function* () {
      const api = yield* resolveApiResult(params.platform);
      yield* await results.fromPromise(api.repost(params.id));
    });
  }

  undoRepost(params: {
    id: PostId;
    platform: Platform;
  }): Promise<results.Result<void, Error>> {
    const resolveApiResult = this.#resolveApiResult.bind(this);
    return fn.run(async function* () {
      const api = yield* resolveApiResult(params.platform);
      yield* await results.fromPromise(api.undoRepost(params.id));
    });
  }

  quotePost(params: {
    text: string;
    quotedPostId: PostId;
    platform: Platform;
  }): Promise<results.Result<Post, Error>> {
    const resolveApiWithPlatformResult =
      this.#resolveApiWithPlatformResult.bind(this);
    return fn.run(async function* () {
      const [resolvedPlatform, api] = yield* resolveApiWithPlatformResult(
        params.platform,
      );
      const me = yield* await results.fromPromise(api.getMe());
      const { id } = yield* await results.fromPromise(
        api.quotePost({
          text: params.text,
          quotedPostId: params.quotedPostId,
        }),
      );
      return {
        id,
        text: params.text,
        authorHandle: me.handle,
        createdAt: new Date(),
        platform: resolvedPlatform,
        referencedPosts: [{ type: "quoted", id: params.quotedPostId }],
      };
    });
  }

  searchPosts(params: {
    query: string;
    maxResults?: number;
    platform: Platform;
  }): Promise<results.Result<Post[], Error>> {
    const resolveApiResult = this.#resolveApiResult.bind(this);
    return fn.run(async function* () {
      const api = yield* resolveApiResult(params.platform);
      return yield* await results.fromPromise(
        api.searchPosts({ query: params.query, maxResults: params.maxResults }),
      );
    });
  }

  async searchPostsAll(params: {
    query: string;
    maxResultsPerPlatform?: number;
  }): Promise<results.Result<Post[], Error>> {
    const maxResults =
      params.maxResultsPerPlatform ?? defaults.DEFAULT_MAX_RESULTS_PER_PLATFORM;
    const platforms = Array.from(this.#apis.keys());
    const perPlatform = await Promise.all(
      platforms.map((p) =>
        this.searchPosts({ query: params.query, maxResults, platform: p }),
      ),
    );
    const all: Post[] = [];
    for (const r of perPlatform) {
      if (results.isOk(r)) all.push(...r.value);
    }
    return results.ok(
      all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    );
  }

  bookmarkPost(params: {
    id: PostId;
    platform: Platform;
  }): Promise<results.Result<void, Error>> {
    const resolveApiResult = this.#resolveApiResult.bind(this);
    return fn.run(async function* () {
      const api = yield* resolveApiResult(params.platform);
      yield* await results.fromPromise(api.bookmarkPost(params.id));
    });
  }

  removeBookmark(params: {
    id: PostId;
    platform: Platform;
  }): Promise<results.Result<void, Error>> {
    const resolveApiResult = this.#resolveApiResult.bind(this);
    return fn.run(async function* () {
      const api = yield* resolveApiResult(params.platform);
      yield* await results.fromPromise(api.removeBookmark(params.id));
    });
  }

  getBookmarks(params: {
    platform: Platform;
    maxResults?: number;
  }): Promise<results.Result<Post[], Error>> {
    const resolveApiResult = this.#resolveApiResult.bind(this);
    return fn.run(async function* () {
      const api = yield* resolveApiResult(params.platform);
      return yield* await results.fromPromise(
        api.getBookmarks({ maxResults: params.maxResults }),
      );
    });
  }
}

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * TwitterSocialApi — SocialApi implementation against X API v2.
 * Caches the authenticated user after the first getMe() call to avoid
 * redundant requests on every getTimeline() invocation.
 */

import type { Post } from "../../domain/entities/post.ts";
import type { UsageData } from "../../domain/entities/usage.ts";
import type { User } from "../../domain/entities/user.ts";
import * as handle from "../../domain/values/handle.ts";
import * as postId from "../../domain/values/post-id.ts";
import type { PostId } from "../../domain/values/post-id.ts";
import * as results from "@eserstack/primitives/results";
import type { SocialApi } from "../../application/social-api.ts";
import * as threadPostError from "../../application/thread-post-error.ts";
import * as mappers from "./mappers.ts";
import type {
  TwitterApiBookmarkRequest,
  TwitterApiBookmarksResponse,
  TwitterApiListResponse,
  TwitterApiRetweetResponse,
  TwitterApiSearchResponse,
  TwitterApiSingleResponse,
  TwitterApiTweet,
  TwitterApiUsageResponse,
  TwitterApiUser,
} from "./types.ts";
import type { TwitterClient } from "./client.ts";

const POST_FIELDS = "author_id,created_at,conversation_id,referenced_tweets";

/**
 * An X post ID is a decimal snowflake of at most 19 digits. Checking it keeps
 * any other string, such as "../../tweets/123" from a model or a mistyped
 * argument, out of the request URLs, where dot segments would resolve to a
 * different endpoint.
 */
const TWEET_ID_PATTERN = /^[0-9]{1,19}$/;

const requireTweetId = (id: PostId): string => {
  if (!TWEET_ID_PATTERN.test(id)) {
    throw new Error(
      `Twitter/X post ID ${
        JSON.stringify(id)
      } is not numeric; use the digits at the end of the post URL, such as 1460323737035677698`,
    );
  }
  return id;
};
const USER_FIELDS = "id,name,username,subscription_type";
const EXPANSIONS = "author_id";

/** Implements SocialApi using X API v2 REST endpoints. */
export class TwitterSocialApi implements SocialApi {
  private readonly client: TwitterClient;
  private cachedMe: User | undefined;

  constructor(client: TwitterClient) {
    this.client = client;
  }

  async createPost(
    params: { text: string },
  ): Promise<{ id: PostId; platformRef?: Record<string, string> }> {
    const response = await this.client.post<
      TwitterApiSingleResponse<TwitterApiTweet>
    >(
      "/tweets",
      { text: params.text },
    );
    return { id: postId.toPostId(response.data.id) };
  }

  async deletePost(id: PostId): Promise<void> {
    await this.client.delete(`/tweets/${requireTweetId(id)}`);
  }

  async getMe(): Promise<User> {
    if (this.cachedMe !== undefined) return this.cachedMe;
    const response = await this.client.get<
      TwitterApiSingleResponse<TwitterApiUser>
    >(
      "/users/me",
      { "user.fields": USER_FIELDS },
    );
    this.cachedMe = mappers.mapToDomainUser(response.data);
    return this.cachedMe;
  }

  async getTimeline(params: { maxResults?: number }): Promise<Post[]> {
    const me = await this.getMe();
    const queryParams: Record<string, string> = {
      "tweet.fields": POST_FIELDS,
      "expansions": EXPANSIONS,
      "user.fields": USER_FIELDS,
    };
    if (params.maxResults !== undefined) {
      queryParams["max_results"] = String(params.maxResults);
    }

    const response = await this.client.get<
      TwitterApiListResponse<TwitterApiTweet>
    >(
      `/users/${me.id}/tweets`,
      queryParams,
    );

    const tweets = response.data ?? [];
    const users = response.includes?.users ?? [];

    // Build a lookup map: author_id → Handle, to avoid per-post awaits
    const handleById = new Map<string, ReturnType<typeof handle.toHandle>>();
    for (const user of users) {
      handleById.set(user.id, handle.toHandle(user.username));
    }

    return tweets.map((tweet) => {
      const authorHandle = tweet.author_id !== undefined
        ? (handleById.get(tweet.author_id) ?? handle.toHandle("unknown"))
        : handle.toHandle("unknown");
      return mappers.mapToDomainPost(tweet, authorHandle);
    });
  }

  async getPost(id: PostId): Promise<Post> {
    const response = await this.client.get<
      TwitterApiSingleResponse<TwitterApiTweet>
    >(
      `/tweets/${requireTweetId(id)}`,
      {
        "tweet.fields": POST_FIELDS,
        expansions: EXPANSIONS,
        "user.fields": USER_FIELDS,
      },
    );
    const users = response.includes?.users ?? [];
    const authorUser = users.find((u) => u.id === response.data.author_id);
    const authorHandle = authorUser !== undefined
      ? handle.toHandle(authorUser.username)
      : handle.toHandle("unknown");
    return mappers.mapToDomainPost(response.data, authorHandle);
  }

  async replyToPost(
    params: { text: string; inReplyToPost: Post },
  ): Promise<{ id: PostId; platformRef?: Record<string, string> }> {
    const response = await this.client.post<
      TwitterApiSingleResponse<TwitterApiTweet>
    >(
      "/tweets",
      {
        text: params.text,
        reply: { in_reply_to_tweet_id: params.inReplyToPost.id },
      },
    );
    return { id: postId.toPostId(response.data.id) };
  }

  async postThread(
    params: { texts: ReadonlyArray<string> },
  ): Promise<results.Result<{ posts: Post[] }, Error>> {
    let me;
    try {
      me = await this.getMe();
    } catch (err) {
      return results.fail(err instanceof Error ? err : new Error(String(err)));
    }

    const postedPosts: Post[] = [];
    let previousId: PostId | undefined;
    let conversationId: PostId | undefined;

    for (const text of params.texts) {
      const body = previousId !== undefined
        ? { text, reply: { in_reply_to_tweet_id: previousId } }
        : { text };

      let response: TwitterApiSingleResponse<TwitterApiTweet>;
      try {
        // Each post replies to the one before it, so the thread posts in order.
        // deno-lint-ignore no-await-in-loop
        response = await this.client.post<
          TwitterApiSingleResponse<TwitterApiTweet>
        >(
          "/tweets",
          body,
        );
      } catch (err) {
        return results.fail(
          new threadPostError.ThreadPartialError(
            postedPosts,
            postedPosts.length,
            params.texts.length,
            err instanceof Error ? err : new Error(String(err)),
          ),
        );
      }

      const id = postId.toPostId(response.data.id);
      if (conversationId === undefined) conversationId = id;
      const post: Post = {
        id,
        text,
        authorHandle: me.handle,
        createdAt: new Date(),
        platform: "twitter",
        ...(previousId !== undefined && { inReplyToId: previousId }),
        conversationId,
      };
      postedPosts.push(post);
      previousId = id;
    }

    return results.ok({ posts: postedPosts });
  }

  /**
   * Fetch replies via conversation_id search.
   * @throws {Error} if the account does not have Basic API tier access.
   */
  async getConversation(
    params: { postId: PostId; maxResults?: number },
  ): Promise<Post[]> {
    const queryParams: Record<string, string> = {
      query: `conversation_id:${requireTweetId(params.postId)}`,
      "tweet.fields": POST_FIELDS,
      expansions: EXPANSIONS,
      "user.fields": USER_FIELDS,
    };
    if (params.maxResults !== undefined) {
      queryParams["max_results"] = String(params.maxResults);
    }

    const response = await this.client.get<
      TwitterApiListResponse<TwitterApiTweet>
    >(
      "/tweets/search/recent",
      queryParams,
    );

    const tweets = response.data ?? [];
    const users = response.includes?.users ?? [];

    const handleById = new Map<string, ReturnType<typeof handle.toHandle>>();
    for (const user of users) {
      handleById.set(user.id, handle.toHandle(user.username));
    }

    return tweets.map((tweet) => {
      const authorHandle = tweet.author_id !== undefined
        ? (handleById.get(tweet.author_id) ?? handle.toHandle("unknown"))
        : handle.toHandle("unknown");
      return mappers.mapToDomainPost(tweet, authorHandle);
    });
  }

  /**
   * Retrieve API usage for the current billing period.
   * @throws {Error} if the account does not have Basic API tier access.
   */
  async getUsage(): Promise<UsageData> {
    const response = await this.client.get<TwitterApiUsageResponse>(
      "/usage/tweets",
      {},
    );
    return mappers.mapToDomainUsage(response);
  }

  async repost(id: PostId): Promise<void> {
    const tweetId = requireTweetId(id);
    const me = await this.getMe();
    await this.client.post<TwitterApiRetweetResponse>(
      `/users/${me.id}/retweets`,
      { tweet_id: tweetId },
    );
  }

  async undoRepost(id: PostId): Promise<void> {
    const tweetId = requireTweetId(id);
    const me = await this.getMe();
    await this.client.delete(`/users/${me.id}/retweets/${tweetId}`);
  }

  async quotePost(
    params: { text: string; quotedPostId: PostId },
  ): Promise<{ id: PostId }> {
    const response = await this.client.post<
      TwitterApiSingleResponse<TwitterApiTweet>
    >(
      "/tweets",
      {
        text: params.text,
        quote_tweet_id: requireTweetId(params.quotedPostId),
      },
    );
    return { id: postId.toPostId(response.data.id) };
  }

  async searchPosts(
    params: { query: string; maxResults?: number },
  ): Promise<Post[]> {
    const queryParams: Record<string, string> = {
      query: params.query,
      "tweet.fields": POST_FIELDS,
      expansions: EXPANSIONS,
      "user.fields": USER_FIELDS,
    };
    if (params.maxResults !== undefined) {
      queryParams["max_results"] = String(params.maxResults);
    }

    const response = await this.client.get<TwitterApiSearchResponse>(
      "/tweets/search/recent",
      queryParams,
    );

    const tweets = response.data ?? [];
    const users = response.includes?.users ?? [];
    const handleById = new Map<string, ReturnType<typeof handle.toHandle>>();
    for (const user of users) {
      handleById.set(user.id, handle.toHandle(user.username));
    }

    return tweets.map((tweet) => {
      const authorHandle = tweet.author_id !== undefined
        ? (handleById.get(tweet.author_id) ?? handle.toHandle("unknown"))
        : handle.toHandle("unknown");
      return mappers.mapToDomainPost(tweet, authorHandle);
    });
  }

  async bookmarkPost(id: PostId): Promise<void> {
    const tweetId = requireTweetId(id);
    const me = await this.getMe();
    await this.client.post<{ data: { bookmarked: boolean } }>(
      `/users/${me.id}/bookmarks`,
      { tweet_id: tweetId } satisfies TwitterApiBookmarkRequest,
    );
  }

  async removeBookmark(id: PostId): Promise<void> {
    const tweetId = requireTweetId(id);
    const me = await this.getMe();
    await this.client.delete(`/users/${me.id}/bookmarks/${tweetId}`);
  }

  async getBookmarks(params?: { maxResults?: number }): Promise<Post[]> {
    const me = await this.getMe();
    const queryParams: Record<string, string> = {
      "tweet.fields": POST_FIELDS,
      expansions: EXPANSIONS,
      "user.fields": USER_FIELDS,
    };
    if (params?.maxResults !== undefined) {
      queryParams["max_results"] = String(params.maxResults);
    }

    const response = await this.client.get<TwitterApiBookmarksResponse>(
      `/users/${me.id}/bookmarks`,
      queryParams,
    );

    const tweets = response.data ?? [];
    const users = response.includes?.users ?? [];
    const handleById = new Map<string, ReturnType<typeof handle.toHandle>>();
    for (const user of users) {
      handleById.set(user.id, handle.toHandle(user.username));
    }

    return tweets.map((tweet) => {
      const authorHandle = tweet.author_id !== undefined
        ? (handleById.get(tweet.author_id) ?? handle.toHandle("unknown"))
        : handle.toHandle("unknown");
      return mappers.mapToDomainPost(tweet, authorHandle);
    });
  }
}

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * BluekysSocialApi — SocialApi implementation against the AT Protocol / Bluesky API.
 * Caches the authenticated user profile after the first getMe() call.
 */

import type { Post } from "../../domain/entities/post.ts";
import type { UsageData } from "../../domain/entities/usage.ts";
import type { User } from "../../domain/entities/user.ts";
import { toPostId } from "../../domain/values/post-id.ts";
import type { PostId } from "../../domain/values/post-id.ts";
import * as results from "@eserstack/primitives/results";
import type { SocialApi } from "../../application/social-api.ts";
import { ThreadPartialError } from "../../application/thread-post-error.ts";
import { mapToDomainPost, mapToDomainUser } from "./mappers.ts";
import type {
  BlueskyCreateRecordResponse,
  BlueskyGetPostsResponse,
  BlueskyListRecordsResponse,
  BlueskyProfileResponse,
  BlueskyRepostRecord,
  BlueskySearchPostsResponse,
  BlueskyThreadResponse,
  BlueskyTimelineResponse,
} from "./types.ts";
import type { BlueskyClient } from "./client.ts";

const COLLECTION = "app.bsky.feed.post";
const POST_TYPE = "app.bsky.feed.post";

/** Extract the rkey (record key) from an AT-URI: `at://did/collection/rkey` */
function extractRkey(atUri: string): string {
  const parts = atUri.split("/");
  const rkey = parts[parts.length - 1];
  return rkey ?? atUri;
}

/** Implements SocialApi using AT Protocol XRPC endpoints. */
export class BluekysSocialApi implements SocialApi {
  private readonly client: BlueskyClient;
  private cachedMe: User | undefined;

  constructor(client: BlueskyClient) {
    this.client = client;
  }

  async createPost(
    params: { text: string },
  ): Promise<{ id: PostId; platformRef?: Record<string, string> }> {
    const did = this.client.did;
    if (did === undefined) {
      throw new Error("Not authenticated — call loginWithCredentials first.");
    }

    const response = await this.client.post<BlueskyCreateRecordResponse>(
      "com.atproto.repo.createRecord",
      {
        repo: did,
        collection: COLLECTION,
        record: {
          "$type": POST_TYPE,
          text: params.text,
          createdAt: new Date().toISOString(),
        },
      },
    );
    return {
      id: toPostId(response.uri),
      platformRef: { uri: response.uri, cid: response.cid },
    };
  }

  async deletePost(id: PostId): Promise<void> {
    const did = this.client.did;
    if (did === undefined) throw new Error("Not authenticated.");

    await this.client.post(
      "com.atproto.repo.deleteRecord",
      { repo: did, collection: COLLECTION, rkey: extractRkey(String(id)) },
    );
  }

  async getMe(): Promise<User> {
    if (this.cachedMe !== undefined) return this.cachedMe;
    const did = this.client.did;
    if (did === undefined) throw new Error("Not authenticated.");

    const response = await this.client.get<BlueskyProfileResponse>(
      "app.bsky.actor.getProfile",
      { actor: did },
    );
    this.cachedMe = mapToDomainUser(response);
    return this.cachedMe;
  }

  async getTimeline(params: { maxResults?: number }): Promise<Post[]> {
    const queryParams: Record<string, string> = {};
    if (params.maxResults !== undefined) {
      queryParams["limit"] = String(params.maxResults);
    }

    const response = await this.client.get<BlueskyTimelineResponse>(
      "app.bsky.feed.getTimeline",
      queryParams,
    );

    return (response.feed ?? []).map((item) => mapToDomainPost(item.post));
  }

  async getPost(id: PostId): Promise<Post> {
    const response = await this.client.get<BlueskyGetPostsResponse>(
      "app.bsky.feed.getPosts",
      { uris: String(id) },
    );
    const postView = response.posts[0];
    if (postView === undefined) throw new Error(`Post not found: ${id}`);
    return mapToDomainPost(postView);
  }

  async replyToPost(
    params: { text: string; inReplyToPost: Post },
  ): Promise<{ id: PostId; platformRef?: Record<string, string> }> {
    const did = this.client.did;
    if (did === undefined) throw new Error("Not authenticated.");

    const parentUri = params.inReplyToPost.platformRef?.["uri"];
    const parentCid = params.inReplyToPost.platformRef?.["cid"];
    if (parentUri === undefined || parentCid === undefined) {
      throw new Error(
        "Cannot reply to this post: missing AT-URI / CID platformRef. " +
          "Ensure the post was fetched via BluekysSocialApi.",
      );
    }

    // For a direct reply, root === parent (single-level reply; not deep thread)
    const ref = { uri: parentUri, cid: parentCid };
    const response = await this.client.post<BlueskyCreateRecordResponse>(
      "com.atproto.repo.createRecord",
      {
        repo: did,
        collection: COLLECTION,
        record: {
          "$type": POST_TYPE,
          text: params.text,
          createdAt: new Date().toISOString(),
          reply: { root: ref, parent: ref },
        },
      },
    );
    return {
      id: toPostId(response.uri),
      platformRef: { uri: response.uri, cid: response.cid },
    };
  }

  async postThread(
    params: { texts: ReadonlyArray<string> },
  ): Promise<results.Result<{ posts: Post[] }, Error>> {
    const did = this.client.did;
    if (did === undefined) {
      return results.fail(new Error("Not authenticated."));
    }

    let me;
    try {
      me = await this.getMe();
    } catch (err) {
      return results.fail(err instanceof Error ? err : new Error(String(err)));
    }

    const postedPosts: Post[] = [];

    let rootRef: { uri: string; cid: string } | undefined;
    let parentRef: { uri: string; cid: string } | undefined;

    for (const text of params.texts) {
      const record: Record<string, unknown> = {
        "$type": POST_TYPE,
        text,
        createdAt: new Date().toISOString(),
      };

      if (rootRef !== undefined && parentRef !== undefined) {
        record["reply"] = { root: rootRef, parent: parentRef };
      }

      let response: BlueskyCreateRecordResponse;
      try {
        // deno-lint-ignore no-await-in-loop
        response = await this.client.post<BlueskyCreateRecordResponse>(
          "com.atproto.repo.createRecord",
          { repo: did, collection: COLLECTION, record },
        );
      } catch (err) {
        return results.fail(
          new ThreadPartialError(
            postedPosts,
            postedPosts.length,
            params.texts.length,
            err instanceof Error ? err : new Error(String(err)),
          ),
        );
      }

      const currentRef = { uri: response.uri, cid: response.cid };

      const post: Post = {
        id: toPostId(response.uri),
        text,
        authorHandle: me.handle,
        createdAt: new Date(),
        platform: "bluesky",
        platformRef: currentRef,
        ...(parentRef !== undefined &&
          { inReplyToId: toPostId(parentRef.uri) }),
        ...(rootRef !== undefined && { conversationId: toPostId(rootRef.uri) }),
      };

      if (rootRef === undefined) rootRef = currentRef;
      parentRef = currentRef;
      postedPosts.push(post);
    }

    return results.ok({ posts: postedPosts });
  }

  /**
   * Fetch a post thread by AT-URI.
   * Returns all posts in the thread as a flat list.
   */
  async getConversation(
    params: { postId: PostId; maxResults?: number },
  ): Promise<Post[]> {
    const depth = params.maxResults !== undefined
      ? Math.min(params.maxResults, 1000)
      : 10;
    const response = await this.client.get<BlueskyThreadResponse>(
      "app.bsky.feed.getPostThread",
      { uri: String(params.postId), depth: String(depth) },
    );

    const posts: Post[] = [];
    const collectPosts = (node: BlueskyThreadResponse["thread"]): void => {
      if (node.post !== undefined) {
        posts.push(mapToDomainPost(node.post));
      }
      for (const reply of node.replies ?? []) {
        collectPosts(reply);
      }
    };
    collectPosts(response.thread);
    return posts;
  }

  /** Bluesky has no billing API — returns empty usage data. */
  getUsage(): Promise<UsageData> {
    return Promise.resolve({ appName: undefined, daily: [], totalCalls: 0 });
  }

  async repost(id: PostId): Promise<void> {
    const did = this.client.did;
    if (did === undefined) throw new Error("Not authenticated.");

    // Fetch the post to get its CID — required for the subject reference.
    const post = await this.getPost(id);
    const uri = String(id);
    const cid = post.platformRef?.["cid"];
    if (cid === undefined) {
      throw new Error(
        "Cannot repost: missing CID. Post must be fetched via BluekysSocialApi.",
      );
    }

    await this.client.post<BlueskyCreateRecordResponse>(
      "com.atproto.repo.createRecord",
      {
        repo: did,
        collection: "app.bsky.feed.repost",
        record: {
          "$type": "app.bsky.feed.repost",
          subject: { uri, cid },
          createdAt: new Date().toISOString(),
        },
      },
    );
  }

  async undoRepost(id: PostId): Promise<void> {
    const did = this.client.did;
    if (did === undefined) throw new Error("Not authenticated.");

    // Bluesky has no "un-repost by subject" API.
    // List the user's repost records (up to 100) and find the one matching this post URI.
    const response = await this.client.get<
      BlueskyListRecordsResponse<BlueskyRepostRecord>
    >(
      "com.atproto.repo.listRecords",
      {
        repo: did,
        collection: "app.bsky.feed.repost",
        limit: "100",
      },
    );

    const repostRecord = response.records.find(
      (r) => r.value.subject.uri === String(id),
    );

    if (repostRecord === undefined) {
      throw new Error(
        "Repost not found — you may not have reposted this post.",
      );
    }

    const rkey = extractRkey(repostRecord.uri);
    await this.client.post(
      "com.atproto.repo.deleteRecord",
      { repo: did, collection: "app.bsky.feed.repost", rkey },
    );
  }

  async quotePost(
    params: { text: string; quotedPostId: PostId },
  ): Promise<{ id: PostId }> {
    const did = this.client.did;
    if (did === undefined) throw new Error("Not authenticated.");

    // Fetch the quoted post to get its CID for the embed reference.
    const quotedPost = await this.getPost(params.quotedPostId);
    const quotedUri = String(params.quotedPostId);
    const quotedCid = quotedPost.platformRef?.["cid"];
    if (quotedCid === undefined) {
      throw new Error(
        "Cannot quote: missing CID. Quoted post must be fetched via BluekysSocialApi.",
      );
    }

    const response = await this.client.post<BlueskyCreateRecordResponse>(
      "com.atproto.repo.createRecord",
      {
        repo: did,
        collection: COLLECTION,
        record: {
          "$type": POST_TYPE,
          text: params.text,
          createdAt: new Date().toISOString(),
          embed: {
            "$type": "app.bsky.embed.record",
            record: { uri: quotedUri, cid: quotedCid },
          },
        },
      },
    );
    return { id: toPostId(response.uri) };
  }

  async searchPosts(
    params: { query: string; maxResults?: number },
  ): Promise<Post[]> {
    const queryParams: Record<string, string> = { q: params.query };
    if (params.maxResults !== undefined) {
      queryParams["limit"] = String(params.maxResults);
    }

    const response = await this.client.get<BlueskySearchPostsResponse>(
      "app.bsky.feed.searchPosts",
      queryParams,
    );

    return (response.posts ?? []).map((postView) => mapToDomainPost(postView));
  }

  bookmarkPost(_id: PostId): Promise<void> {
    return Promise.reject(
      new Error(
        "Bookmarks are not available on Bluesky. Bluesky does not expose a bookmark API.",
      ),
    );
  }

  removeBookmark(_id: PostId): Promise<void> {
    return Promise.reject(
      new Error("Bookmarks are not available on Bluesky."),
    );
  }

  getBookmarks(_params?: { maxResults?: number }): Promise<Post[]> {
    return Promise.reject(
      new Error("Bookmarks are not available on Bluesky."),
    );
  }
}

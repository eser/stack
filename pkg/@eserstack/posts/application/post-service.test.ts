// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as results from "@eserstack/primitives/results";
import * as postIdMod from "../domain/values/post-id.ts";
import * as handleMod from "../domain/values/handle.ts";
import * as postServiceMod from "./post-service.ts";
import type { FeedAggregator } from "./feed-aggregator.ts";
import type { Scheduler } from "./scheduler.ts";
import type { Translator } from "./translator.ts";
import {
  createMockAuthProvider,
  createMockFeedAggregator,
  createMockScheduler,
  createMockSocialApi,
  createMockTranslator,
  createTestPost,
  createTestUser,
} from "./testing.ts";

// ── Test helper ───────────────────────────────────────────────────────────────

function makeService(overrides: {
  socialApi?: ReturnType<typeof createMockSocialApi>;
  translator?: Translator;
  scheduler?: Scheduler;
  feedAggregator?: FeedAggregator;
  platform?: "twitter" | "bluesky";
} = {}): postServiceMod.PostService {
  const socialApi = overrides.socialApi ?? createMockSocialApi();
  const platform = overrides.platform ?? "twitter";
  return new postServiceMod.PostService(
    [{ platform, socialApi, auth: createMockAuthProvider() }],
    overrides.translator ?? createMockTranslator(),
    overrides.scheduler ?? createMockScheduler(),
    overrides.feedAggregator ?? createMockFeedAggregator(),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

bdd.describe("PostService", () => {
  bdd.describe("composePost", () => {
    bdd.it("should call socialApi.createPost with the text", async () => {
      const socialApi = createMockSocialApi();
      const service = makeService({ socialApi });

      await service.composePost("Hello world");

      const createCall = socialApi.calls.find((c) => c.method === "createPost");
      assert.assertEquals(createCall?.args[0], { text: "Hello world" });
    });

    bdd.it("should call socialApi.getMe for author handle", async () => {
      const socialApi = createMockSocialApi();
      const service = makeService({ socialApi });

      await service.composePost("Hello world");

      const getMeCall = socialApi.calls.find((c) => c.method === "getMe");
      assert.assertEquals(getMeCall !== undefined, true);
    });

    bdd.it("should return Ok with correct Post fields", async () => {
      const service = makeService();
      const r = await service.composePost("Hello world");

      assert.assertEquals(results.isOk(r), true);
      if (!results.isOk(r)) return;
      assert.assertEquals(r.value.text, "Hello world");
      assert.assertEquals(r.value.id, postIdMod.toPostId("new-post-1"));
      assert.assertEquals(
        r.value.authorHandle,
        handleMod.toHandle("testuser"),
      );
      assert.assertEquals(r.value.platform, "twitter");
    });

    bdd.it("should return Fail when socialApi.createPost rejects", async () => {
      const socialApi = createMockSocialApi({
        createPost: () => Promise.reject(new Error("API down")),
      });
      const service = makeService({ socialApi });

      const r = await service.composePost("Hello");

      assert.assertEquals(results.isFail(r), true);
      if (results.isFail(r)) {
        assert.assertMatch(r.error.message, /API down/);
      }
    });

    bdd.it("should return Fail when socialApi.getMe rejects", async () => {
      const socialApi = createMockSocialApi({
        getMe: () => Promise.reject(new Error("Auth expired")),
      });
      const service = makeService({ socialApi });

      const r = await service.composePost("Hello");

      assert.assertEquals(results.isFail(r), true);
      if (results.isFail(r)) {
        assert.assertMatch(r.error.message, /Auth expired/);
      }
    });
  });

  bdd.describe("translateAndPost", () => {
    bdd.it("should translate first then post", async () => {
      const socialApi = createMockSocialApi();
      const translator = createMockTranslator();
      const service = makeService({ socialApi, translator });

      await service.translateAndPost({ text: "Merhaba", from: "tr", to: "en" });

      const translateCall = translator.calls.find((c) =>
        c.method === "translate"
      );
      assert.assertEquals(translateCall !== undefined, true);
      const createCall = socialApi.calls.find((c) => c.method === "createPost");
      assert.assertEquals(createCall !== undefined, true);
    });

    bdd.it(
      "should pass translated text to createPost, not original",
      async () => {
        const socialApi = createMockSocialApi();
        const service = makeService({
          socialApi,
          translator: createMockTranslator({
            translate: () => Promise.resolve(results.ok("Hello")),
          }),
        });

        await service.translateAndPost({
          text: "Merhaba",
          from: "tr",
          to: "en",
        });

        const createCall = socialApi.calls.find((c) =>
          c.method === "createPost"
        );
        assert.assertEquals(createCall?.args[0], { text: "Hello" });
      },
    );

    bdd.it(
      "should return Fail when translator rejects (without calling createPost)",
      async () => {
        const socialApi = createMockSocialApi();
        const service = makeService({
          socialApi,
          translator: createMockTranslator({
            translate: () =>
              Promise.resolve(results.fail(new Error("LLM down"))),
          }),
        });

        const r = await service.translateAndPost({
          text: "test",
          from: "tr",
          to: "en",
        });

        assert.assertEquals(results.isFail(r), true);
        if (results.isFail(r)) {
          assert.assertMatch(r.error.message, /LLM down/);
        }
        assert.assertEquals(
          socialApi.calls.some((c) => c.method === "createPost"),
          false,
        );
      },
    );
  });

  bdd.describe("replyToPost", () => {
    bdd.it(
      "should call socialApi.replyToPost with text and parent post",
      async () => {
        const socialApi = createMockSocialApi();
        const service = makeService({ socialApi });
        const parent = createTestPost({ id: postIdMod.toPostId("parent-1") });

        await service.replyToPost({ text: "My reply", inReplyToPost: parent });

        const replyCall = socialApi.calls.find((c) =>
          c.method === "replyToPost"
        );
        assert.assertEquals(replyCall !== undefined, true);
      },
    );

    bdd.it("should return Ok with inReplyToId set", async () => {
      const service = makeService();
      const parent = createTestPost({ id: postIdMod.toPostId("parent-1") });

      const r = await service.replyToPost({
        text: "My reply",
        inReplyToPost: parent,
      });

      assert.assertEquals(results.isOk(r), true);
      if (!results.isOk(r)) return;
      assert.assertEquals(r.value.inReplyToId, postIdMod.toPostId("parent-1"));
      assert.assertEquals(r.value.text, "My reply");
    });
  });

  bdd.describe("postThread", () => {
    bdd.it("should delegate to socialApi.postThread", async () => {
      const socialApi = createMockSocialApi();
      const service = makeService({ socialApi });

      await service.postThread(["Post 1", "Post 2"]);

      const threadCall = socialApi.calls.find((c) => c.method === "postThread");
      assert.assertEquals(threadCall?.args[0], { texts: ["Post 1", "Post 2"] });
    });

    bdd.it("should return Ok with array of Posts", async () => {
      const posts = [
        createTestPost({ id: postIdMod.toPostId("p1"), text: "Post 1" }),
        createTestPost({ id: postIdMod.toPostId("p2"), text: "Post 2" }),
      ];
      const service = makeService({
        socialApi: createMockSocialApi({
          postThread: () => Promise.resolve(results.ok({ posts })),
        }),
      });

      const r = await service.postThread(["Post 1", "Post 2"]);

      assert.assertEquals(results.isOk(r), true);
      if (!results.isOk(r)) return;
      assert.assertEquals(r.value.length, 2);
      assert.assertEquals(r.value[0]?.text, "Post 1");
    });
  });

  bdd.describe("schedulePost", () => {
    bdd.it("should delegate to scheduler.schedule", async () => {
      const scheduler = createMockScheduler();
      const service = makeService({ scheduler });
      const scheduledAt = new Date("2026-06-01T12:00:00Z");

      await service.schedulePost({ text: "Scheduled post", scheduledAt });

      const scheduleCall = scheduler.calls.find((c) => c.method === "schedule");
      assert.assertEquals(scheduleCall?.args[0], {
        text: "Scheduled post",
        scheduledAt,
      });
    });

    bdd.it("should return Fail when scheduler rejects", async () => {
      const service = makeService({
        scheduler: createMockScheduler({
          schedule: () => Promise.reject(new Error("Queue full")),
        }),
      });

      const r = await service.schedulePost({
        text: "test",
        scheduledAt: new Date(),
      });

      assert.assertEquals(results.isFail(r), true);
      if (results.isFail(r)) {
        assert.assertMatch(r.error.message, /Queue full/);
      }
    });
  });

  bdd.describe("getTimeline", () => {
    bdd.it("should delegate to socialApi.getTimeline", async () => {
      const socialApi = createMockSocialApi();
      const service = makeService({ socialApi });

      await service.getTimeline();

      assert.assertEquals(
        socialApi.calls.some((c) => c.method === "getTimeline"),
        true,
      );
    });

    bdd.it("should pass maxResults to socialApi", async () => {
      const socialApi = createMockSocialApi();
      const service = makeService({ socialApi });

      await service.getTimeline({ maxResults: 5 });

      const call = socialApi.calls.find((c) => c.method === "getTimeline");
      assert.assertEquals(call?.args[0], { maxResults: 5 });
    });
  });

  bdd.describe("getUnifiedTimeline", () => {
    bdd.it("should delegate to feedAggregator.getUnifiedTimeline", async () => {
      const feedAggregator = createMockFeedAggregator();
      const service = makeService({ feedAggregator });

      await service.getUnifiedTimeline({ maxResultsPerPlatform: 3 });

      const call = feedAggregator.calls.find((c) =>
        c.method === "getUnifiedTimeline"
      );
      assert.assertEquals(call?.args[0], { maxResultsPerPlatform: 3 });
    });
  });

  bdd.describe("resolveApi — platform routing", () => {
    bdd.it(
      "should return Fail when requested platform is not configured",
      async () => {
        const service = makeService({ platform: "twitter" });

        const r = await service.composePost("test", "bluesky");

        assert.assertEquals(results.isFail(r), true);
        if (results.isFail(r)) {
          assert.assertMatch(r.error.message, /bluesky/);
        }
      },
    );

    bdd.it("should return Fail when no platforms are configured", async () => {
      const service = new postServiceMod.PostService(
        [],
        createMockTranslator(),
        createMockScheduler(),
        createMockFeedAggregator(),
      );

      const r = await service.composePost("test");

      assert.assertEquals(results.isFail(r), true);
    });
  });

  bdd.describe("composePostToAll", () => {
    bdd.it("should post to all configured platforms", async () => {
      const twitterApi = createMockSocialApi({
        getMe: () => Promise.resolve(createTestUser({ platform: "twitter" })),
      });
      const blueskyApi = createMockSocialApi({
        getMe: () => Promise.resolve(createTestUser({ platform: "bluesky" })),
      });
      const service = new postServiceMod.PostService(
        [
          {
            platform: "twitter",
            socialApi: twitterApi,
            auth: createMockAuthProvider(),
          },
          {
            platform: "bluesky",
            socialApi: blueskyApi,
            auth: createMockAuthProvider(),
          },
        ],
        createMockTranslator(),
        createMockScheduler(),
        createMockFeedAggregator(),
      );

      const r = await service.composePostToAll("Cross-platform post");

      assert.assertEquals(results.isOk(r), true);
      if (!results.isOk(r)) return;
      const postResults = r.value;
      assert.assertEquals(postResults.length, 2);
      assert.assertEquals(
        twitterApi.calls.some((c) => c.method === "createPost"),
        true,
      );
      assert.assertEquals(
        blueskyApi.calls.some((c) => c.method === "createPost"),
        true,
      );
      assert.assertEquals(
        postResults.every((pr) => pr.post !== undefined),
        true,
      );
      assert.assertEquals(
        postResults.every((pr) => pr.error === undefined),
        true,
      );
    });

    bdd.it(
      "should return Ok with one PostResult per platform even when one fails",
      async () => {
        const service = new postServiceMod.PostService(
          [
            {
              platform: "twitter",
              socialApi: createMockSocialApi({
                createPost: () => Promise.reject(new Error("Twitter down")),
              }),
              auth: createMockAuthProvider(),
            },
            {
              platform: "bluesky",
              socialApi: createMockSocialApi(),
              auth: createMockAuthProvider(),
            },
          ],
          createMockTranslator(),
          createMockScheduler(),
          createMockFeedAggregator(),
        );

        const r = await service.composePostToAll("test");

        assert.assertEquals(results.isOk(r), true);
        if (!results.isOk(r)) return;
        const postResults = r.value;
        assert.assertEquals(postResults.length, 2);
        const twitterResult = postResults.find((pr) =>
          pr.platform === "twitter"
        );
        const blueskyResult = postResults.find((pr) =>
          pr.platform === "bluesky"
        );
        assert.assertEquals(twitterResult?.error?.message, "Twitter down");
        assert.assertEquals(twitterResult?.post, undefined);
        assert.assertEquals(blueskyResult?.post !== undefined, true);
        assert.assertEquals(blueskyResult?.error, undefined);
      },
    );
  });

  bdd.describe("repost", () => {
    bdd.it(
      "should delegate to correct platform's socialApi.repost",
      async () => {
        const socialApi = createMockSocialApi();
        const service = makeService({ socialApi, platform: "twitter" });

        await service.repost({
          id: postIdMod.toPostId("tweet-1"),
          platform: "twitter",
        });

        const call = socialApi.calls.find((c) => c.method === "repost");
        assert.assertEquals(call !== undefined, true);
        assert.assertEquals(call?.args[0], postIdMod.toPostId("tweet-1"));
      },
    );

    bdd.it("should return Fail when socialApi.repost rejects", async () => {
      const service = makeService({
        socialApi: createMockSocialApi({
          repost: () => Promise.reject(new Error("Rate limited")),
        }),
      });

      const r = await service.repost({
        id: postIdMod.toPostId("tweet-1"),
        platform: "twitter",
      });

      assert.assertEquals(results.isFail(r), true);
      if (results.isFail(r)) {
        assert.assertMatch(r.error.message, /Rate limited/);
      }
    });

    bdd.it("should return Fail when platform is not configured", async () => {
      const service = makeService({ platform: "twitter" });

      const r = await service.repost({
        id: postIdMod.toPostId("post-1"),
        platform: "bluesky",
      });

      assert.assertEquals(results.isFail(r), true);
      if (results.isFail(r)) {
        assert.assertMatch(r.error.message, /bluesky/);
      }
    });
  });

  bdd.describe("undoRepost", () => {
    bdd.it(
      "should delegate to correct platform's socialApi.undoRepost",
      async () => {
        const socialApi = createMockSocialApi();
        const service = makeService({ socialApi, platform: "twitter" });

        await service.undoRepost({
          id: postIdMod.toPostId("tweet-1"),
          platform: "twitter",
        });

        const call = socialApi.calls.find((c) => c.method === "undoRepost");
        assert.assertEquals(call !== undefined, true);
        assert.assertEquals(call?.args[0], postIdMod.toPostId("tweet-1"));
      },
    );

    bdd.it("should return Fail when socialApi.undoRepost rejects", async () => {
      const service = makeService({
        socialApi: createMockSocialApi({
          undoRepost: () => Promise.reject(new Error("Not found")),
        }),
      });

      const r = await service.undoRepost({
        id: postIdMod.toPostId("tweet-1"),
        platform: "twitter",
      });

      assert.assertEquals(results.isFail(r), true);
      if (results.isFail(r)) {
        assert.assertMatch(r.error.message, /Not found/);
      }
    });
  });

  bdd.describe("quotePost", () => {
    bdd.it(
      "should call socialApi.quotePost with text and quotedPostId",
      async () => {
        const socialApi = createMockSocialApi();
        const service = makeService({ socialApi, platform: "twitter" });

        await service.quotePost({
          text: "Great take!",
          quotedPostId: postIdMod.toPostId("original-1"),
          platform: "twitter",
        });

        const call = socialApi.calls.find((c) => c.method === "quotePost");
        assert.assertEquals(call?.args[0], {
          text: "Great take!",
          quotedPostId: postIdMod.toPostId("original-1"),
        });
      },
    );

    bdd.it(
      "should return Ok with referencedPosts containing quoted type",
      async () => {
        const service = makeService({ platform: "twitter" });

        const r = await service.quotePost({
          text: "Great take!",
          quotedPostId: postIdMod.toPostId("original-1"),
          platform: "twitter",
        });

        assert.assertEquals(results.isOk(r), true);
        if (!results.isOk(r)) return;
        assert.assertEquals(r.value.text, "Great take!");
        assert.assertEquals(r.value.platform, "twitter");
        assert.assertEquals(r.value.referencedPosts?.length, 1);
        assert.assertEquals(r.value.referencedPosts?.[0], {
          type: "quoted",
          id: postIdMod.toPostId("original-1"),
        });
      },
    );

    bdd.it("should return Fail when socialApi.quotePost rejects", async () => {
      const service = makeService({
        socialApi: createMockSocialApi({
          quotePost: () => Promise.reject(new Error("Auth expired")),
        }),
      });

      const r = await service.quotePost({
        text: "test",
        quotedPostId: postIdMod.toPostId("q-1"),
        platform: "twitter",
      });

      assert.assertEquals(results.isFail(r), true);
      if (results.isFail(r)) {
        assert.assertMatch(r.error.message, /Auth expired/);
      }
    });
  });

  bdd.describe("searchPosts", () => {
    bdd.it(
      "should delegate to correct platform's socialApi.searchPosts",
      async () => {
        const socialApi = createMockSocialApi();
        const service = makeService({ socialApi, platform: "twitter" });

        await service.searchPosts({
          query: "deno typescript",
          platform: "twitter",
        });

        const call = socialApi.calls.find((c) => c.method === "searchPosts");
        assert.assertEquals(call !== undefined, true);
      },
    );

    bdd.it("should pass query and maxResults through", async () => {
      const socialApi = createMockSocialApi();
      const service = makeService({ socialApi, platform: "twitter" });

      await service.searchPosts({
        query: "hello world",
        maxResults: 5,
        platform: "twitter",
      });

      const call = socialApi.calls.find((c) => c.method === "searchPosts");
      assert.assertEquals(call?.args[0], {
        query: "hello world",
        maxResults: 5,
      });
    });

    bdd.it(
      "should return Fail when platform is not configured",
      async () => {
        const service = makeService({ platform: "twitter" });

        const r = await service.searchPosts({
          query: "test",
          platform: "bluesky",
        });

        assert.assertEquals(results.isFail(r), true);
        if (results.isFail(r)) {
          assert.assertMatch(r.error.message, /bluesky/);
        }
      },
    );
  });

  bdd.describe("searchPostsAll", () => {
    bdd.it(
      "should merge results from multiple platforms sorted by date desc",
      async () => {
        const olderPost = createTestPost({
          platform: "twitter",
          createdAt: new Date("2026-01-01T10:00:00Z"),
          text: "older",
        });
        const newerPost = createTestPost({
          platform: "bluesky",
          createdAt: new Date("2026-01-01T12:00:00Z"),
          text: "newer",
        });
        const service = new postServiceMod.PostService(
          [
            {
              platform: "twitter",
              socialApi: createMockSocialApi({
                searchPosts: () => Promise.resolve([olderPost]),
              }),
              auth: createMockAuthProvider(),
            },
            {
              platform: "bluesky",
              socialApi: createMockSocialApi({
                searchPosts: () => Promise.resolve([newerPost]),
              }),
              auth: createMockAuthProvider(),
            },
          ],
          createMockTranslator(),
          createMockScheduler(),
          createMockFeedAggregator(),
        );

        const r = await service.searchPostsAll({ query: "test" });

        assert.assertEquals(results.isOk(r), true);
        if (!results.isOk(r)) return;
        assert.assertEquals(r.value.length, 2);
        assert.assertEquals(r.value[0]?.text, "newer");
        assert.assertEquals(r.value[1]?.text, "older");
      },
    );

    bdd.it(
      "should return available results when one platform fails",
      async () => {
        const post = createTestPost({
          platform: "bluesky",
          text: "bluesky result",
        });
        const service = new postServiceMod.PostService(
          [
            {
              platform: "twitter",
              socialApi: createMockSocialApi({
                searchPosts: () => Promise.reject(new Error("Twitter down")),
              }),
              auth: createMockAuthProvider(),
            },
            {
              platform: "bluesky",
              socialApi: createMockSocialApi({
                searchPosts: () => Promise.resolve([post]),
              }),
              auth: createMockAuthProvider(),
            },
          ],
          createMockTranslator(),
          createMockScheduler(),
          createMockFeedAggregator(),
        );

        const r = await service.searchPostsAll({ query: "test" });

        assert.assertEquals(results.isOk(r), true);
        if (!results.isOk(r)) return;
        assert.assertEquals(r.value.length, 1);
        assert.assertEquals(r.value[0]?.text, "bluesky result");
      },
    );
  });

  bdd.describe("bookmarkPost", () => {
    bdd.it(
      "should delegate to correct platform's socialApi.bookmarkPost",
      async () => {
        const socialApi = createMockSocialApi();
        const service = makeService({ socialApi, platform: "twitter" });

        await service.bookmarkPost({
          id: postIdMod.toPostId("tweet-1"),
          platform: "twitter",
        });

        const call = socialApi.calls.find((c) => c.method === "bookmarkPost");
        assert.assertEquals(call !== undefined, true);
        assert.assertEquals(call?.args[0], postIdMod.toPostId("tweet-1"));
      },
    );

    bdd.it(
      "should return Fail when platform is not configured",
      async () => {
        const service = makeService({ platform: "twitter" });

        const r = await service.bookmarkPost({
          id: postIdMod.toPostId("post-1"),
          platform: "bluesky",
        });

        assert.assertEquals(results.isFail(r), true);
        if (results.isFail(r)) {
          assert.assertMatch(r.error.message, /bluesky/);
        }
      },
    );

    bdd.it(
      "should return Fail when socialApi.bookmarkPost rejects",
      async () => {
        const service = makeService({
          socialApi: createMockSocialApi({
            bookmarkPost: () =>
              Promise.reject(new Error("Bookmark scope missing")),
          }),
        });

        const r = await service.bookmarkPost({
          id: postIdMod.toPostId("t-1"),
          platform: "twitter",
        });

        assert.assertEquals(results.isFail(r), true);
        if (results.isFail(r)) {
          assert.assertMatch(r.error.message, /Bookmark scope missing/);
        }
      },
    );
  });

  bdd.describe("getBookmarks", () => {
    bdd.it(
      "should return Ok with bookmarks from specified platform",
      async () => {
        const post = createTestPost({ text: "bookmarked post" });
        const socialApi = createMockSocialApi({
          getBookmarks: () => Promise.resolve([post]),
        });
        const service = makeService({ socialApi, platform: "twitter" });

        const r = await service.getBookmarks({ platform: "twitter" });

        assert.assertEquals(results.isOk(r), true);
        if (!results.isOk(r)) return;
        assert.assertEquals(r.value.length, 1);
        assert.assertEquals(r.value[0]?.text, "bookmarked post");
      },
    );

    bdd.it("should pass maxResults through", async () => {
      const socialApi = createMockSocialApi();
      const service = makeService({ socialApi, platform: "twitter" });

      await service.getBookmarks({ platform: "twitter", maxResults: 5 });

      const call = socialApi.calls.find((c) => c.method === "getBookmarks");
      assert.assertEquals(call?.args[0], { maxResults: 5 });
    });

    bdd.it(
      "should return Fail when platform is not configured",
      async () => {
        const service = makeService({ platform: "twitter" });

        const r = await service.getBookmarks({ platform: "bluesky" });

        assert.assertEquals(results.isFail(r), true);
        if (results.isFail(r)) {
          assert.assertMatch(r.error.message, /bluesky/);
        }
      },
    );
  });
});

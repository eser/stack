// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as taskMod from "@eserstack/functions/task";
import * as results from "@eserstack/primitives/results";
import type { Platform } from "../domain/values/platform.ts";
import type { AuthProvider } from "./auth-provider.ts";
import * as authRequiredError from "./auth-required-error.ts";
import type { PostsCtx } from "./context.ts";
import * as defaults from "./defaults.ts";
import * as fanOutPartialError from "./fan-out-partial-error.ts";
import * as handlers from "./handlers.ts";
import * as postServiceMod from "./post-service.ts";
import type { SocialApi } from "./social-api.ts";
import * as testing from "./testing.ts";

/** Two platforms with mock APIs; twitter comes first, so it is the default. */
const createWorld = (apiOverrides?: {
  readonly twitter?: Partial<SocialApi>;
  readonly bluesky?: Partial<SocialApi>;
}) => {
  const apis = {
    twitter: testing.createMockSocialApi(apiOverrides?.twitter),
    bluesky: testing.createMockSocialApi(apiOverrides?.bluesky),
  };
  const auths = {
    twitter: testing.createMockAuthProvider({
      refreshToken: () =>
        Promise.resolve(
          testing.createTestTokens({ accessToken: "refreshed-twitter" }),
        ),
    }),
    bluesky: testing.createMockAuthProvider(),
  };
  const feedAggregator = testing.createMockFeedAggregator();
  const postService = new postServiceMod.PostService(
    [
      { platform: "twitter", socialApi: apis.twitter, auth: auths.twitter },
      { platform: "bluesky", socialApi: apis.bluesky, auth: auths.bluesky },
    ],
    testing.createMockTranslator(),
    testing.createMockScheduler(),
    feedAggregator,
  );
  const tokenStore = testing.createMockTokenStore();
  const ctx: PostsCtx = {
    postService,
    tokenStore,
    auths: new Map<Platform, AuthProvider>([
      ["twitter", auths.twitter],
      ["bluesky", auths.bluesky],
    ]),
  };
  return { apis, auths, tokenStore, feedAggregator, postService, ctx };
};

type World = ReturnType<typeof createWorld>;

/** The world's context, with saved tokens for both platforms. */
const withSavedTokens = (world: World): PostsCtx => {
  world.tokenStore.store.set("twitter", testing.createTestTokens());
  world.tokenStore.store.set("bluesky", testing.createTestTokens());
  return world.ctx;
};

/**
 * The two ways a context can be wired: with auth providers and saved tokens
 * for both platforms (the CLI, the terminal menu and the agent), and with the
 * PostService alone.
 */
const wirings: ReadonlyArray<{
  readonly name: string;
  readonly contextOf: (world: World) => PostsCtx;
}> = [
  { name: "with auth providers", contextOf: withSavedTokens },
  {
    name: "without auth providers",
    contextOf: (world) => ({ postService: world.postService }),
  },
];

const methodsCalled = (api: testing.MockSocialApi): string[] =>
  api.calls.map((call) => call.method);

/** The handlers whose input may omit the platform. */
const optionalPlatformHandlers: ReadonlyArray<{
  readonly name: string;
  readonly run: (ctx: PostsCtx) => Promise<results.Result<unknown, Error>>;
  readonly apiMethod: string;
}> = [
  {
    name: "composeTweetHandler",
    run: (ctx) =>
      taskMod.runTask(handlers.composeTweetHandler({ text: "Hello" }), ctx),
    apiMethod: "createPost",
  },
  {
    name: "translateAndPostHandler",
    run: (ctx) =>
      taskMod.runTask(
        handlers.translateAndPostHandler({
          text: "Merhaba",
          from: "tr",
          to: "en",
        }),
        ctx,
      ),
    apiMethod: "createPost",
  },
  {
    name: "postThreadHandler",
    run: (ctx) =>
      taskMod.runTask(
        handlers.postThreadHandler({ texts: ["one", "two"] }),
        ctx,
      ),
    apiMethod: "postThread",
  },
  {
    name: "getTimelineHandler",
    run: (ctx) =>
      taskMod.runTask(handlers.getTimelineHandler({ maxResults: 5 }), ctx),
    apiMethod: "getTimeline",
  },
  {
    name: "getUsageHandler",
    run: (ctx) => taskMod.runTask(handlers.getUsageHandler({}), ctx),
    apiMethod: "getUsage",
  },
];

bdd.describe("handlers without a platform in the input", () => {
  for (const { name, run, apiMethod } of optionalPlatformHandlers) {
    bdd.it(
      `${name} refreshes and uses the saved tokens of the first platform`,
      async () => {
        const world = createWorld();
        world.tokenStore.store.set(
          "twitter",
          testing.createTestTokens({
            accessToken: "expired-twitter",
            expiresAt: new Date(0),
          }),
        );

        const result = await run(world.ctx);

        assert.assert(results.isOk(result), String(result));
        const installed = world.auths.twitter.calls
          .filter((call) => call.method === "setTokens")
          .map((call) => (call.args[0] as { accessToken: string }).accessToken);
        assert.assertEquals(installed, ["refreshed-twitter"]);
        assert.assertEquals(
          world.tokenStore.store.get("twitter")?.accessToken,
          "refreshed-twitter",
        );
        assert.assertArrayIncludes(methodsCalled(world.apis.twitter), [
          apiMethod,
        ]);
        assert.assertEquals(methodsCalled(world.apis.bluesky), []);
      },
    );

    bdd.it(
      `${name} fails without calling the API when there are no saved tokens`,
      async () => {
        const world = createWorld();

        const result = await run(world.ctx);

        assert.assert(results.isFail(result));
        assert.assertInstanceOf(
          result.error,
          authRequiredError.AuthRequiredError,
        );
        assert.assertEquals(methodsCalled(world.apis.twitter), []);
      },
    );
  }

  bdd.it(
    "leave the platform to the PostService without auth providers",
    async () => {
      const world = createWorld();

      const result = await taskMod.runTask(
        handlers.composeTweetHandler({ text: "Hello" }),
        { postService: world.postService },
      );

      assert.assert(results.isOk(result));
      assert.assertEquals(result.value.platform, "twitter");
      assert.assertEquals(world.tokenStore.calls, []);
    },
  );

  bdd.it("use the platform the input names", async () => {
    const world = createWorld();
    world.tokenStore.store.set("bluesky", testing.createTestTokens());

    const result = await taskMod.runTask(
      handlers.composeTweetHandler({ text: "Hello", platform: "bluesky" }),
      world.ctx,
    );

    assert.assert(results.isOk(result));
    assert.assertEquals(result.value.platform, "bluesky");
    assert.assertEquals(methodsCalled(world.apis.twitter), []);
  });
});

bdd.describe("composePostToAllHandler", () => {
  for (const { name, contextOf } of wirings) {
    bdd.it(`${name}, returns every post in platform order`, async () => {
      const world = createWorld();

      const result = await taskMod.runTask(
        handlers.composePostToAllHandler({ text: "Hello" }),
        contextOf(world),
      );

      assert.assert(results.isOk(result), String(result));
      assert.assertEquals(
        result.value.map((post) => post.platform),
        ["twitter", "bluesky"],
      );
    });

    bdd.it(
      `${name}, fails with FanOutPartialError carrying the posted post and the failed platform`,
      async () => {
        const world = createWorld({
          bluesky: {
            createPost: () => Promise.reject(new Error("Bluesky is down")),
          },
        });

        const result = await taskMod.runTask(
          handlers.composePostToAllHandler({ text: "Hello" }),
          contextOf(world),
        );

        assert.assert(results.isFail(result));
        assert.assertInstanceOf(
          result.error,
          fanOutPartialError.FanOutPartialError,
        );
        const partial = result.error as fanOutPartialError.FanOutPartialError;
        assert.assertEquals(
          partial.posted.map((post) => post.platform),
          ["twitter"],
        );
        assert.assertEquals(
          partial.failed.map((failure) => [
            failure.platform,
            failure.error.message,
          ]),
          [["bluesky", "Bluesky is down"]],
        );
        assert.assertEquals(partial.totalPlatforms, 2);
      },
    );

    bdd.it(
      `${name}, fails with FanOutPartialError when every platform fails`,
      async () => {
        const down = () => Promise.reject(new Error("down"));
        const world = createWorld({
          twitter: { createPost: down },
          bluesky: { createPost: down },
        });

        const result = await taskMod.runTask(
          handlers.composePostToAllHandler({ text: "Hello" }),
          contextOf(world),
        );

        assert.assert(results.isFail(result));
        const partial = result.error as fanOutPartialError.FanOutPartialError;
        assert.assertEquals(partial.posted, []);
        assert.assertEquals(
          partial.failed.map((failure) => failure.platform),
          ["twitter", "bluesky"],
        );
      },
    );
  }

  bdd.it(
    "fails without publishing when no platform is configured",
    async () => {
      const postService = new postServiceMod.PostService(
        [],
        testing.createMockTranslator(),
        testing.createMockScheduler(),
        testing.createMockFeedAggregator(),
      );

      const result = await taskMod.runTask(
        handlers.composePostToAllHandler({ text: "Hello" }),
        { postService },
      );

      assert.assert(results.isFail(result));
      assert.assertStringIncludes(result.error.message, "no platform");
    },
  );
});

bdd.describe("cross-platform read defaults", () => {
  for (const { name, contextOf } of wirings) {
    bdd.it(
      `${name}, searchPostsAllHandler asks each platform for the default count`,
      async () => {
        const world = createWorld();

        const result = await taskMod.runTask(
          handlers.searchPostsAllHandler({ query: "node" }),
          contextOf(world),
        );

        assert.assert(results.isOk(result), String(result));
        for (const api of [world.apis.twitter, world.apis.bluesky]) {
          const search = api.calls.find(
            (call) => call.method === "searchPosts",
          );
          assert.assertEquals(search?.args[0], {
            query: "node",
            maxResults: defaults.DEFAULT_MAX_RESULTS_PER_PLATFORM,
          });
        }
      },
    );

    bdd.it(
      `${name}, searchPostsAllHandler leaves out a failed platform`,
      async () => {
        const world = createWorld({
          twitter: {
            searchPosts: () => Promise.reject(new Error("Twitter is down")),
          },
          bluesky: {
            searchPosts: () =>
              Promise.resolve([
                testing.createTestPost({ platform: "bluesky", text: "found" }),
              ]),
          },
        });

        const result = await taskMod.runTask(
          handlers.searchPostsAllHandler({ query: "node" }),
          contextOf(world),
        );

        assert.assert(results.isOk(result));
        assert.assertEquals(
          result.value.map((post) => post.text),
          ["found"],
        );
      },
    );

    bdd.it(
      `${name}, searchPostsAllHandler passes an explicit count through`,
      async () => {
        const world = createWorld();

        await taskMod.runTask(
          handlers.searchPostsAllHandler({
            query: "node",
            maxResultsPerPlatform: 3,
          }),
          contextOf(world),
        );

        const search = world.apis.bluesky.calls.find(
          (call) => call.method === "searchPosts",
        );
        assert.assertEquals(search?.args[0], { query: "node", maxResults: 3 });
      },
    );
  }

  bdd.it(
    "getUnifiedTimelineHandler with auth providers asks each platform for the default count",
    async () => {
      const world = createWorld();

      const result = await taskMod.runTask(
        handlers.getUnifiedTimelineHandler({}),
        withSavedTokens(world),
      );

      assert.assert(results.isOk(result), String(result));
      for (const api of [world.apis.twitter, world.apis.bluesky]) {
        const timeline = api.calls.find(
          (call) => call.method === "getTimeline",
        );
        assert.assertEquals(timeline?.args[0], {
          maxResults: defaults.DEFAULT_MAX_RESULTS_PER_PLATFORM,
        });
      }
    },
  );

  bdd.it(
    "getUnifiedTimelineHandler without auth providers passes the default count to the feed aggregator",
    async () => {
      const world = createWorld();

      const result = await taskMod.runTask(
        handlers.getUnifiedTimelineHandler({}),
        { postService: world.postService },
      );

      assert.assert(results.isOk(result), String(result));
      assert.assertEquals(world.feedAggregator.calls, [
        {
          method: "getUnifiedTimeline",
          args: [
            {
              maxResultsPerPlatform: defaults.DEFAULT_MAX_RESULTS_PER_PLATFORM,
            },
          ],
        },
      ]);
    },
  );
});

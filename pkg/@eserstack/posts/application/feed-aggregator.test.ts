// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as feedAggregatorMod from "./feed-aggregator.ts";
import {
  createMockAuthProvider,
  createMockSocialApi,
  createTestPost,
} from "./testing.ts";

bdd.describe("DefaultFeedAggregator", () => {
  bdd.describe("getUnifiedTimeline", () => {
    bdd.it(
      "should return posts from a single authenticated platform",
      async () => {
        const post = createTestPost({
          platform: "bluesky",
          text: "Bluesky post",
        });
        const aggregator = new feedAggregatorMod.DefaultFeedAggregator([
          {
            platform: "bluesky",
            socialApi: createMockSocialApi({
              getTimeline: () => Promise.resolve([post]),
            }),
            auth: createMockAuthProvider({ isAuthenticated: () => true }),
          },
        ]);

        const result = await aggregator.getUnifiedTimeline();

        assert.assertEquals(result.length, 1);
        assert.assertEquals(result[0]?.text, "Bluesky post");
      },
    );

    bdd.it("should skip unauthenticated platforms", async () => {
      const aggregator = new feedAggregatorMod.DefaultFeedAggregator([
        {
          platform: "twitter",
          socialApi: createMockSocialApi(),
          auth: createMockAuthProvider({ isAuthenticated: () => false }),
        },
      ]);

      const result = await aggregator.getUnifiedTimeline();

      assert.assertEquals(result.length, 0);
    });

    bdd.it(
      "should merge posts from multiple platforms sorted by createdAt desc",
      async () => {
        const twitterPost = createTestPost({
          platform: "twitter",
          createdAt: new Date("2026-04-13T10:00:00Z"),
          text: "From Twitter",
        });
        const blueskyPost = createTestPost({
          platform: "bluesky",
          createdAt: new Date("2026-04-13T11:00:00Z"),
          text: "From Bluesky",
        });

        const aggregator = new feedAggregatorMod.DefaultFeedAggregator([
          {
            platform: "twitter",
            socialApi: createMockSocialApi({
              getTimeline: () => Promise.resolve([twitterPost]),
            }),
            auth: createMockAuthProvider({ isAuthenticated: () => true }),
          },
          {
            platform: "bluesky",
            socialApi: createMockSocialApi({
              getTimeline: () => Promise.resolve([blueskyPost]),
            }),
            auth: createMockAuthProvider({ isAuthenticated: () => true }),
          },
        ]);

        const result = await aggregator.getUnifiedTimeline();

        assert.assertEquals(result.length, 2);
        assert.assertEquals(result[0]?.text, "From Bluesky"); // newer first
        assert.assertEquals(result[1]?.text, "From Twitter");
      },
    );

    bdd.it("should preserve the platform field on each post", async () => {
      const aggregator = new feedAggregatorMod.DefaultFeedAggregator([
        {
          platform: "twitter",
          socialApi: createMockSocialApi({
            getTimeline: () =>
              Promise.resolve([createTestPost({ platform: "twitter" })]),
          }),
          auth: createMockAuthProvider({ isAuthenticated: () => true }),
        },
        {
          platform: "bluesky",
          socialApi: createMockSocialApi({
            getTimeline: () =>
              Promise.resolve([createTestPost({ platform: "bluesky" })]),
          }),
          auth: createMockAuthProvider({ isAuthenticated: () => true }),
        },
      ]);

      const result = await aggregator.getUnifiedTimeline();
      const platforms = result.map((p) => p.platform).sort();

      assert.assertEquals(platforms, ["bluesky", "twitter"]);
    });

    bdd.it(
      "should return available posts when one platform fails",
      async () => {
        const blueskyPost = createTestPost({
          platform: "bluesky",
          text: "Bluesky OK",
        });
        const aggregator = new feedAggregatorMod.DefaultFeedAggregator([
          {
            platform: "twitter",
            socialApi: createMockSocialApi({
              getTimeline: () => Promise.reject(new Error("Twitter down")),
            }),
            auth: createMockAuthProvider({ isAuthenticated: () => true }),
          },
          {
            platform: "bluesky",
            socialApi: createMockSocialApi({
              getTimeline: () => Promise.resolve([blueskyPost]),
            }),
            auth: createMockAuthProvider({ isAuthenticated: () => true }),
          },
        ]);

        const result = await aggregator.getUnifiedTimeline();

        assert.assertEquals(result.length, 1);
        assert.assertEquals(result[0]?.text, "Bluesky OK");
      },
    );

    bdd.it("should return empty array when both platforms fail", async () => {
      const aggregator = new feedAggregatorMod.DefaultFeedAggregator([
        {
          platform: "twitter",
          socialApi: createMockSocialApi({
            getTimeline: () => Promise.reject(new Error("Twitter down")),
          }),
          auth: createMockAuthProvider({ isAuthenticated: () => true }),
        },
        {
          platform: "bluesky",
          socialApi: createMockSocialApi({
            getTimeline: () => Promise.reject(new Error("Bluesky down")),
          }),
          auth: createMockAuthProvider({ isAuthenticated: () => true }),
        },
      ]);

      const result = await aggregator.getUnifiedTimeline();

      assert.assertEquals(result.length, 0);
    });

    bdd.it(
      "should return empty array when no platforms are authenticated",
      async () => {
        const aggregator = new feedAggregatorMod.DefaultFeedAggregator([
          {
            platform: "twitter",
            socialApi: createMockSocialApi(),
            auth: createMockAuthProvider({ isAuthenticated: () => false }),
          },
          {
            platform: "bluesky",
            socialApi: createMockSocialApi(),
            auth: createMockAuthProvider({ isAuthenticated: () => false }),
          },
        ]);

        const result = await aggregator.getUnifiedTimeline();

        assert.assertEquals(result.length, 0);
      },
    );

    bdd.it(
      "should return empty array when no connections are configured",
      async () => {
        const aggregator = new feedAggregatorMod.DefaultFeedAggregator([]);

        const result = await aggregator.getUnifiedTimeline();

        assert.assertEquals(result.length, 0);
      },
    );

    bdd.it(
      "should pass maxResultsPerPlatform to each socialApi.getTimeline",
      async () => {
        const socialApi = createMockSocialApi({
          getTimeline: () => Promise.resolve([]),
        });
        const aggregator = new feedAggregatorMod.DefaultFeedAggregator([
          {
            platform: "twitter",
            socialApi,
            auth: createMockAuthProvider({ isAuthenticated: () => true }),
          },
        ]);

        await aggregator.getUnifiedTimeline({ maxResultsPerPlatform: 7 });

        const call = socialApi.calls.find((c) => c.method === "getTimeline");
        assert.assertEquals(call?.args[0], { maxResults: 7 });
      },
    );

    bdd.it("should default maxResults to 10 when not specified", async () => {
      const socialApi = createMockSocialApi({
        getTimeline: () => Promise.resolve([]),
      });
      const aggregator = new feedAggregatorMod.DefaultFeedAggregator([
        {
          platform: "twitter",
          socialApi,
          auth: createMockAuthProvider({ isAuthenticated: () => true }),
        },
      ]);

      await aggregator.getUnifiedTimeline();

      const call = socialApi.calls.find((c) => c.method === "getTimeline");
      assert.assertEquals(call?.args[0], { maxResults: 10 });
    });
  });
});

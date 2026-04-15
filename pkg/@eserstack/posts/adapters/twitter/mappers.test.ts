// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as handleMod from "../../domain/values/handle.ts";
import * as postIdMod from "../../domain/values/post-id.ts";
import * as mappersMod from "./mappers.ts";
import type { TwitterApiTweet, TwitterApiUsageResponse } from "./types.ts";

bdd.describe("Twitter mappers", () => {
  bdd.describe("mapToDomainPost", () => {
    bdd.it("should map all fields correctly", () => {
      const raw: TwitterApiTweet = {
        id: "1234567890",
        text: "Hello Twitter",
        author_id: "user-001",
        created_at: "2026-01-01T00:00:00Z",
        conversation_id: "1234567890",
      };
      const authorHandle = handleMod.toHandle("testuser");

      const post = mappersMod.mapToDomainPost(raw, authorHandle);

      assert.assertEquals(post.id, postIdMod.toPostId("1234567890"));
      assert.assertEquals(post.text, "Hello Twitter");
      assert.assertEquals(post.authorHandle, handleMod.toHandle("testuser"));
      assert.assertEquals(post.createdAt, new Date("2026-01-01T00:00:00Z"));
      assert.assertEquals(post.platform, "twitter");
      assert.assertEquals(
        post.conversationId,
        postIdMod.toPostId("1234567890"),
      );
    });

    bdd.it("should set platform to 'twitter'", () => {
      const raw: TwitterApiTweet = { id: "1", text: "test" };

      const post = mappersMod.mapToDomainPost(raw, handleMod.toHandle("u"));

      assert.assertEquals(post.platform, "twitter");
    });

    bdd.it(
      "should default createdAt to epoch when created_at is missing",
      () => {
        const raw: TwitterApiTweet = { id: "1", text: "test" };

        const post = mappersMod.mapToDomainPost(raw, handleMod.toHandle("u"));

        assert.assertEquals(post.createdAt, new Date(0));
      },
    );

    bdd.it("should omit conversationId when missing", () => {
      const raw: TwitterApiTweet = { id: "1", text: "test" };

      const post = mappersMod.mapToDomainPost(raw, handleMod.toHandle("u"));

      assert.assertEquals(post.conversationId, undefined);
    });

    bdd.it("should map referenced_tweets to referencedPosts", () => {
      const raw: TwitterApiTweet = {
        id: "999",
        text: "reply",
        referenced_tweets: [
          { type: "replied_to", id: "100" },
          { type: "quoted", id: "200" },
          { type: "retweeted", id: "300" },
        ],
      };

      const post = mappersMod.mapToDomainPost(raw, handleMod.toHandle("u"));

      assert.assertEquals(post.referencedPosts?.length, 3);
      assert.assertEquals(post.referencedPosts?.[0], {
        type: "replied_to",
        id: postIdMod.toPostId("100"),
      });
      assert.assertEquals(post.referencedPosts?.[1], {
        type: "quoted",
        id: postIdMod.toPostId("200"),
      });
      // "retweeted" maps to "reposted" in the domain
      assert.assertEquals(post.referencedPosts?.[2], {
        type: "reposted",
        id: postIdMod.toPostId("300"),
      });
    });

    bdd.it("should omit unknown referenced_tweet types", () => {
      const raw: TwitterApiTweet = {
        id: "999",
        text: "test",
        referenced_tweets: [{ type: "unknown_future_type", id: "100" }],
      };

      const post = mappersMod.mapToDomainPost(raw, handleMod.toHandle("u"));

      assert.assertEquals(post.referencedPosts?.length, 0);
    });

    bdd.it("should not include platformRef (Twitter uses id only)", () => {
      const raw: TwitterApiTweet = { id: "1", text: "test" };

      const post = mappersMod.mapToDomainPost(raw, handleMod.toHandle("u"));

      assert.assertEquals(post.platformRef, undefined);
    });
  });

  bdd.describe("mapToDomainUser", () => {
    bdd.it("should map all fields correctly", () => {
      const user = mappersMod.mapToDomainUser({
        id: "user-001",
        name: "Eser Ozvataf",
        username: "eserozvataf",
      });

      assert.assertEquals(user.id, "user-001");
      assert.assertEquals(user.handle, handleMod.toHandle("eserozvataf"));
      assert.assertEquals(user.displayName, "Eser Ozvataf");
      assert.assertEquals(user.platform, "twitter");
    });

    bdd.it("should normalise username to lowercase Handle", () => {
      const user = mappersMod.mapToDomainUser({
        id: "1",
        name: "Test",
        username: "UpperCaseUser",
      });

      assert.assertEquals(user.handle, "uppercaseuser");
    });
  });

  bdd.describe("mapToOAuthTokens", () => {
    bdd.it("should map access and refresh tokens", () => {
      const tokens = mappersMod.mapToOAuthTokens({
        access_token: "at-123",
        refresh_token: "rt-456",
        token_type: "bearer",
      });

      assert.assertEquals(tokens.accessToken, "at-123");
      assert.assertEquals(tokens.refreshToken, "rt-456");
    });

    bdd.it("should compute expiresAt from expires_in seconds", () => {
      const before = Date.now();
      const tokens = mappersMod.mapToOAuthTokens({
        access_token: "at",
        token_type: "bearer",
        expires_in: 3600,
      });
      const after = Date.now();

      assert.assertEquals(tokens.expiresAt instanceof Date, true);
      const expMs = tokens.expiresAt!.getTime();
      assert.assertEquals(expMs >= before + 3600 * 1000, true);
      assert.assertEquals(expMs <= after + 3600 * 1000, true);
    });

    bdd.it("should omit expiresAt when expires_in is absent", () => {
      const tokens = mappersMod.mapToOAuthTokens({
        access_token: "at",
        token_type: "bearer",
      });

      assert.assertEquals(tokens.expiresAt, undefined);
    });
  });

  bdd.describe("mapToDomainUsage", () => {
    bdd.it("should aggregate daily usage and compute totalCalls", () => {
      const raw: TwitterApiUsageResponse = {
        data: {
          daily_client_app_usage: [
            {
              app_id: "app-1",
              app_name: "TestApp",
              usage: [
                {
                  start: "2026-01-01T00:00:00.000Z",
                  end: "2026-01-01T23:59:59.000Z",
                  usage_types: [
                    { usage_type: "app_auth", count: 5 },
                    { usage_type: "user_auth", count: 3 },
                  ],
                },
              ],
            },
          ],
        },
      };

      const usage = mappersMod.mapToDomainUsage(raw);

      assert.assertEquals(usage.appName, "TestApp");
      assert.assertEquals(usage.totalCalls, 8);
      assert.assertEquals(usage.daily.length, 1);
      assert.assertEquals(usage.daily[0]?.callCount, 8);
      assert.assertEquals(
        usage.daily[0]?.date,
        new Date("2026-01-01T00:00:00.000Z"),
      );
    });

    bdd.it("should sort daily entries by date ascending", () => {
      const raw: TwitterApiUsageResponse = {
        data: {
          daily_client_app_usage: [
            {
              usage: [
                {
                  start: "2026-01-03T00:00:00.000Z",
                  end: "2026-01-03T23:59:59.000Z",
                  usage_types: [{ usage_type: "app_auth", count: 1 }],
                },
                {
                  start: "2026-01-01T00:00:00.000Z",
                  end: "2026-01-01T23:59:59.000Z",
                  usage_types: [{ usage_type: "app_auth", count: 2 }],
                },
              ],
            },
          ],
        },
      };

      const usage = mappersMod.mapToDomainUsage(raw);

      assert.assertEquals(usage.daily[0]?.callCount, 2); // Jan 1 first
      assert.assertEquals(usage.daily[1]?.callCount, 1); // Jan 3 second
    });

    bdd.it(
      "should return empty data for missing daily_client_app_usage",
      () => {
        const usage = mappersMod.mapToDomainUsage({});

        assert.assertEquals(usage.appName, undefined);
        assert.assertEquals(usage.daily.length, 0);
        assert.assertEquals(usage.totalCalls, 0);
      },
    );
  });
});

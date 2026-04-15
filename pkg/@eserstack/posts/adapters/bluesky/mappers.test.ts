// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as handleMod from "../../domain/values/handle.ts";
import * as postIdMod from "../../domain/values/post-id.ts";
import * as mappersMod from "./mappers.ts";
import type { BlueskyPostView, BlueskyProfileResponse } from "./types.ts";

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makePostView(
  overrides: Partial<BlueskyPostView> = {},
): BlueskyPostView {
  return {
    uri: "at://did:plc:testuser/app.bsky.feed.post/abc123",
    cid: "bafyreiabc123",
    author: { did: "did:plc:testuser", handle: "testuser.bsky.social" },
    record: {
      "$type": "app.bsky.feed.post",
      text: "Hello Bluesky!",
      createdAt: "2026-01-01T00:00:00Z",
    },
    indexedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

bdd.describe("Bluesky mappers", () => {
  bdd.describe("mapToDomainPost", () => {
    bdd.it("should map all base fields correctly", () => {
      const raw = makePostView();

      const post = mappersMod.mapToDomainPost(raw);

      assert.assertEquals(
        post.id,
        postIdMod.toPostId("at://did:plc:testuser/app.bsky.feed.post/abc123"),
      );
      assert.assertEquals(post.text, "Hello Bluesky!");
      assert.assertEquals(
        post.authorHandle,
        handleMod.toHandle("testuser.bsky.social"),
      );
      assert.assertEquals(post.createdAt, new Date("2026-01-01T00:00:00Z"));
    });

    bdd.it("should set platform to 'bluesky'", () => {
      const post = mappersMod.mapToDomainPost(makePostView());

      assert.assertEquals(post.platform, "bluesky");
    });

    bdd.it("should set platformRef with uri and cid", () => {
      const raw = makePostView({
        uri: "at://did:plc:testuser/app.bsky.feed.post/abc123",
        cid: "bafyreiabc123",
      });

      const post = mappersMod.mapToDomainPost(raw);

      assert.assertEquals(post.platformRef, {
        uri: "at://did:plc:testuser/app.bsky.feed.post/abc123",
        cid: "bafyreiabc123",
      });
    });

    bdd.it("should not set inReplyToId when record has no reply", () => {
      const post = mappersMod.mapToDomainPost(makePostView());

      assert.assertEquals(post.inReplyToId, undefined);
    });

    bdd.it("should set inReplyToId from reply.root.uri", () => {
      const raw = makePostView({
        record: {
          "$type": "app.bsky.feed.post",
          text: "This is a reply",
          createdAt: "2026-01-01T00:01:00Z",
          reply: {
            root: {
              uri: "at://did:plc:other/app.bsky.feed.post/root1",
              cid: "bafroot1",
            },
            parent: {
              uri: "at://did:plc:other/app.bsky.feed.post/parent1",
              cid: "bafparent1",
            },
          },
        },
      });

      const post = mappersMod.mapToDomainPost(raw);

      // inReplyToId comes from root (the thread root), not parent
      assert.assertEquals(
        post.inReplyToId,
        postIdMod.toPostId("at://did:plc:other/app.bsky.feed.post/root1"),
      );
    });

    bdd.it("should normalise author handle to lowercase without @", () => {
      const raw = makePostView({
        author: { did: "did:plc:test", handle: "TEST.bsky.social" },
      });

      const post = mappersMod.mapToDomainPost(raw);

      assert.assertEquals(post.authorHandle, "test.bsky.social");
    });

    bdd.it(
      "should use indexedAt for createdAt (AT Protocol indexing time)",
      () => {
        const raw = makePostView({ indexedAt: "2026-03-15T12:30:00Z" });

        const post = mappersMod.mapToDomainPost(raw);

        assert.assertEquals(post.createdAt, new Date("2026-03-15T12:30:00Z"));
      },
    );
  });

  bdd.describe("mapToDomainUser", () => {
    bdd.it("should map DID, handle, and displayName", () => {
      const raw: BlueskyProfileResponse = {
        did: "did:plc:abc123",
        handle: "eser.bsky.social",
        displayName: "Eser Ozvataf",
      };

      const user = mappersMod.mapToDomainUser(raw);

      assert.assertEquals(user.id, "did:plc:abc123");
      assert.assertEquals(user.handle, handleMod.toHandle("eser.bsky.social"));
      assert.assertEquals(user.displayName, "Eser Ozvataf");
      assert.assertEquals(user.platform, "bluesky");
    });

    bdd.it("should fall back to handle when displayName is absent", () => {
      const raw: BlueskyProfileResponse = {
        did: "did:plc:abc123",
        handle: "anon.bsky.social",
      };

      const user = mappersMod.mapToDomainUser(raw);

      assert.assertEquals(user.displayName, "anon.bsky.social");
    });

    bdd.it("should set platform to 'bluesky'", () => {
      const user = mappersMod.mapToDomainUser({
        did: "did:plc:x",
        handle: "x.bsky.social",
      });

      assert.assertEquals(user.platform, "bluesky");
    });
  });
});

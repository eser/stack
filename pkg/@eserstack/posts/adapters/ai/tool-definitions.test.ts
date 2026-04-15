// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import {
  bookmarkPostDefinition,
  composePostToAllDefinition,
  composeTweetDefinition,
  getPostDefinition,
  postThreadDefinition,
  postToolDefinitions,
  quotePostDefinition,
  removeBookmarkDefinition,
  replyDefinition,
  repostDefinition,
  searchPostsAllDefinition,
  searchPostsDefinition,
  translateAndPostDefinition,
  undoRepostDefinition,
} from "./tool-definitions.ts";

bdd.describe("postToolDefinitions", () => {
  bdd.it("exports exactly 13 tool definitions", () => {
    assert.assertEquals(postToolDefinitions.length, 13);
  });

  bdd.it("contains each expected tool name", () => {
    const names = postToolDefinitions.map((d) => d.name);
    assert.assertArrayIncludes(names, [
      "compose_post",
      "compose_post_all",
      "translate_and_post",
      "reply_to_post",
      "post_thread",
      "repost",
      "undo_repost",
      "quote_post",
      "search_posts",
      "search_posts_all",
      "get_post",
      "bookmark_post",
      "remove_bookmark",
    ]);
  });

  bdd.it("compose_post has text as required, platform optional", () => {
    const params = composeTweetDefinition.parameters as Record<string, unknown>;
    const required = params["required"] as string[];
    assert.assertArrayIncludes(required, ["text"]);
    assert.assertEquals(required.includes("platform"), false);
  });

  bdd.it("compose_post_all has text as required", () => {
    const params = composePostToAllDefinition.parameters as Record<
      string,
      unknown
    >;
    const required = params["required"] as string[];
    assert.assertArrayIncludes(required, ["text"]);
  });

  bdd.it("translate_and_post requires text, from, and to", () => {
    const params = translateAndPostDefinition.parameters as Record<
      string,
      unknown
    >;
    const required = params["required"] as string[];
    assert.assertArrayIncludes(required, ["text", "from", "to"]);
    assert.assertEquals(required.includes("platform"), false);
  });

  bdd.it("reply_to_post requires text, inReplyToId, and platform", () => {
    const params = replyDefinition.parameters as Record<string, unknown>;
    const required = params["required"] as string[];
    assert.assertArrayIncludes(required, ["text", "inReplyToId", "platform"]);
  });

  bdd.it("post_thread requires texts array, platform optional", () => {
    const params = postThreadDefinition.parameters as Record<string, unknown>;
    const required = params["required"] as string[];
    assert.assertArrayIncludes(required, ["texts"]);
    assert.assertEquals(required.includes("platform"), false);
  });

  bdd.it("repost and undo_repost both require id and platform", () => {
    for (const def of [repostDefinition, undoRepostDefinition]) {
      const params = def.parameters as Record<string, unknown>;
      const required = params["required"] as string[];
      assert.assertArrayIncludes(required, ["id", "platform"]);
    }
  });

  bdd.it("quote_post requires text, quotedPostId, and platform", () => {
    const params = quotePostDefinition.parameters as Record<string, unknown>;
    const required = params["required"] as string[];
    assert.assertArrayIncludes(required, ["text", "quotedPostId", "platform"]);
  });

  bdd.it(
    "search_posts requires query and platform, maxResults optional",
    () => {
      const params = searchPostsDefinition.parameters as Record<
        string,
        unknown
      >;
      const required = params["required"] as string[];
      assert.assertArrayIncludes(required, ["query", "platform"]);
      assert.assertEquals(required.includes("maxResults"), false);
    },
  );

  bdd.it("search_posts_all requires only query", () => {
    const params = searchPostsAllDefinition.parameters as Record<
      string,
      unknown
    >;
    const required = params["required"] as string[];
    assert.assertArrayIncludes(required, ["query"]);
    assert.assertEquals(required.includes("platform"), false);
  });

  bdd.it("get_post requires id and platform", () => {
    const params = getPostDefinition.parameters as Record<string, unknown>;
    const required = params["required"] as string[];
    assert.assertArrayIncludes(required, ["id", "platform"]);
  });

  bdd.it(
    "bookmark_post and remove_bookmark both require id and platform",
    () => {
      for (const def of [bookmarkPostDefinition, removeBookmarkDefinition]) {
        const params = def.parameters as Record<string, unknown>;
        const required = params["required"] as string[];
        assert.assertArrayIncludes(required, ["id", "platform"]);
      }
    },
  );

  bdd.it("every definition has a non-empty description", () => {
    for (const def of postToolDefinitions) {
      assert.assertNotEquals(
        def.description.trim(),
        "",
        `${def.name} description should not be empty`,
      );
    }
  });
});

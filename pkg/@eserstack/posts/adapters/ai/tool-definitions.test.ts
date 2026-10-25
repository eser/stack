// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import type * as ai from "@eserstack/ai/mod";
import * as results from "@eserstack/primitives/results";
import * as defaults from "../../application/defaults.ts";
import * as fanOutPartialError from "../../application/fan-out-partial-error.ts";
import * as testing from "../../application/testing.ts";
import * as threadPostError from "../../application/thread-post-error.ts";
import * as charLimits from "../../domain/values/char-limits.ts";
import * as toolDefinitions from "./tool-definitions.ts";
import * as triggers from "./triggers.ts";

bdd.describe("postToolDefinitions", () => {
  bdd.it("exports exactly 13 tool definitions", () => {
    assert.assertEquals(toolDefinitions.postToolDefinitions.length, 13);
  });

  bdd.it("contains each expected tool name", () => {
    const names = toolDefinitions.postToolDefinitions.map((d) => d.name);
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
    const params = toolDefinitions.composeTweetDefinition.parameters as Record<
      string,
      unknown
    >;
    const required = params["required"] as string[];
    assert.assertArrayIncludes(required, ["text"]);
    assert.assertEquals(required.includes("platform"), false);
  });

  bdd.it("compose_post_all has text as required", () => {
    const params = toolDefinitions.composePostToAllDefinition
      .parameters as Record<string, unknown>;
    const required = params["required"] as string[];
    assert.assertArrayIncludes(required, ["text"]);
  });

  bdd.it("translate_and_post requires text, from, and to", () => {
    const params = toolDefinitions.translateAndPostDefinition
      .parameters as Record<string, unknown>;
    const required = params["required"] as string[];
    assert.assertArrayIncludes(required, ["text", "from", "to"]);
    assert.assertEquals(required.includes("platform"), false);
  });

  bdd.it("reply_to_post requires text, inReplyToId, and platform", () => {
    const params = toolDefinitions.replyDefinition.parameters as Record<
      string,
      unknown
    >;
    const required = params["required"] as string[];
    assert.assertArrayIncludes(required, ["text", "inReplyToId", "platform"]);
  });

  bdd.it("post_thread requires texts array, platform optional", () => {
    const params = toolDefinitions.postThreadDefinition.parameters as Record<
      string,
      unknown
    >;
    const required = params["required"] as string[];
    assert.assertArrayIncludes(required, ["texts"]);
    assert.assertEquals(required.includes("platform"), false);
  });

  bdd.it("repost and undo_repost both require id and platform", () => {
    for (const def of [
      toolDefinitions.repostDefinition,
      toolDefinitions.undoRepostDefinition,
    ]) {
      const params = def.parameters as Record<string, unknown>;
      const required = params["required"] as string[];
      assert.assertArrayIncludes(required, ["id", "platform"]);
    }
  });

  bdd.it("quote_post requires text, quotedPostId, and platform", () => {
    const params = toolDefinitions.quotePostDefinition.parameters as Record<
      string,
      unknown
    >;
    const required = params["required"] as string[];
    assert.assertArrayIncludes(required, ["text", "quotedPostId", "platform"]);
  });

  bdd.it(
    "search_posts requires query and platform, maxResults optional",
    () => {
      const params = toolDefinitions.searchPostsDefinition.parameters as Record<
        string,
        unknown
      >;
      const required = params["required"] as string[];
      assert.assertArrayIncludes(required, ["query", "platform"]);
      assert.assertEquals(required.includes("maxResults"), false);
    },
  );

  bdd.it("search_posts_all requires only query", () => {
    const params = toolDefinitions.searchPostsAllDefinition
      .parameters as Record<string, unknown>;
    const required = params["required"] as string[];
    assert.assertArrayIncludes(required, ["query"]);
    assert.assertEquals(required.includes("platform"), false);
  });

  bdd.it("get_post requires id and platform", () => {
    const params = toolDefinitions.getPostDefinition.parameters as Record<
      string,
      unknown
    >;
    const required = params["required"] as string[];
    assert.assertArrayIncludes(required, ["id", "platform"]);
  });

  bdd.it(
    "bookmark_post and remove_bookmark both require id and platform",
    () => {
      for (const def of [
        toolDefinitions.bookmarkPostDefinition,
        toolDefinitions.removeBookmarkDefinition,
      ]) {
        const params = def.parameters as Record<string, unknown>;
        const required = params["required"] as string[];
        assert.assertArrayIncludes(required, ["id", "platform"]);
      }
    },
  );

  bdd.it("every definition has a non-empty description", () => {
    for (const def of toolDefinitions.postToolDefinitions) {
      assert.assertNotEquals(
        def.description.trim(),
        "",
        `${def.name} description should not be empty`,
      );
    }
  });
});

bdd.describe("postToolDefinitions descriptions", () => {
  const toolNames = new Set(
    toolDefinitions.postToolDefinitions.map((d) => d.name),
  );

  bdd.it("each has 3 or 4 sentences", () => {
    for (const def of toolDefinitions.postToolDefinitions) {
      const sentences = def.description.split(/(?<=[.!?])\s+(?=[A-Z])/);
      assert.assert(
        sentences.length >= 3 && sentences.length <= 4,
        `${def.name} has ${sentences.length} sentences`,
      );
    }
  });

  bdd.it("each says whether it publishes publicly or only reads", () => {
    for (const def of toolDefinitions.postToolDefinitions) {
      assert.assertMatch(def.description, /\bpublic\b|\bread-only\b/);
    }
  });

  bdd.it("each names a sibling tool", () => {
    for (const def of toolDefinitions.postToolDefinitions) {
      const words = new Set(def.description.split(/[^a-z_]+/));
      const siblings = [...toolNames].filter(
        (name) => name !== def.name && words.has(name),
      );

      assert.assertNotEquals(
        siblings.length,
        0,
        `${def.name} names no sibling`,
      );
    }
  });

  bdd.it("names only tools that exist", () => {
    for (const def of toolDefinitions.postToolDefinitions) {
      const snakeCaseNames =
        def.description.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [];

      for (const name of snakeCaseNames) {
        assert.assert(toolNames.has(name), `${def.name} names unknown ${name}`);
      }
    }
  });

  bdd.it("each states what it returns and how a failure comes back", () => {
    for (const def of toolDefinitions.postToolDefinitions) {
      assert.assertStringIncludes(def.description, "Returns ");
      assert.assertMatch(def.description, /\berror\b/);
    }
  });

  bdd.it("text parameters state the domain character limits", () => {
    const limits = [
      charLimits.getCharacterLimit({
        platform: "twitter",
        subscriptionTier: "free",
      }),
      charLimits.getCharacterLimit({
        platform: "twitter",
        subscriptionTier: "premium_plus",
      }),
      charLimits.getCharacterLimit({
        platform: "bluesky",
        subscriptionTier: "free",
      }),
    ];
    const textParameters: ReadonlyArray<[ai.ToolDefinition, string]> = [
      [toolDefinitions.composeTweetDefinition, "text"],
      [toolDefinitions.composePostToAllDefinition, "text"],
      [toolDefinitions.translateAndPostDefinition, "text"],
      [toolDefinitions.replyDefinition, "text"],
      [toolDefinitions.postThreadDefinition, "texts"],
      [toolDefinitions.quotePostDefinition, "text"],
    ];

    for (const [def, parameter] of textParameters) {
      const properties = def.parameters?.["properties"] as Record<
        string,
        { description: string }
      >;
      const description = properties[parameter]?.description ?? "";
      for (const limit of limits) {
        assert.assertMatch(
          description,
          new RegExp(`\\b${limit}\\b`),
          `${def.name}.${parameter} should state the ${limit} limit`,
        );
      }
    }
  });
});

bdd.describe("postToolDefinitions partial failures", () => {
  /** The keys of the error content mapToToolResponse sends for an error. */
  const contentKeys = (error: Error): string[] => {
    const response = triggers.mapToToolResponse(results.fail(error));
    return Object.keys(response.content as Record<string, unknown>);
  };

  const cases: ReadonlyArray<{
    readonly definition: ai.ToolDefinition;
    readonly error: Error;
  }> = [
    {
      definition: toolDefinitions.composePostToAllDefinition,
      error: new fanOutPartialError.FanOutPartialError({
        posted: [testing.createTestPost()],
        failed: [{ platform: "bluesky", error: new Error("down") }],
        totalPlatforms: 2,
      }),
    },
    {
      definition: toolDefinitions.postThreadDefinition,
      error: new threadPostError.ThreadPartialError(
        [testing.createTestPost()],
        1,
        2,
        new Error("down"),
      ),
    },
  ];

  for (const { definition, error } of cases) {
    bdd.it(`${definition.name} names every field of its error content`, () => {
      const keys = contentKeys(error);
      assert.assertNotEquals(keys, []);
      for (const key of keys) {
        assert.assertMatch(
          definition.description,
          new RegExp(`\\b${key}\\b`),
          `${definition.name} does not name ${key}`,
        );
      }
    });
  }
});

bdd.describe("postToolDefinitions results without a value", () => {
  const voidTools = [
    toolDefinitions.repostDefinition,
    toolDefinitions.undoRepostDefinition,
    toolDefinitions.bookmarkPostDefinition,
    toolDefinitions.removeBookmarkDefinition,
  ];

  for (const definition of voidTools) {
    bdd.it(`${definition.name} says it returns the null it sends`, () => {
      const response = triggers.mapToToolResponse(results.ok(undefined));

      assert.assertEquals(response.content, null);
      assert.assertStringIncludes(
        definition.description,
        "Returns null on success.",
      );
    });
  }
});

bdd.describe("postToolDefinitions defaults", () => {
  bdd.it("search_posts_all states the per-platform default", () => {
    const properties = toolDefinitions.searchPostsAllDefinition.parameters?.[
      "properties"
    ] as Record<string, { description: string }>;

    assert.assertMatch(
      properties["maxResultsPerPlatform"]?.description ?? "",
      new RegExp(`\\b${defaults.DEFAULT_MAX_RESULTS_PER_PLATFORM}\\b`),
    );
  });
});

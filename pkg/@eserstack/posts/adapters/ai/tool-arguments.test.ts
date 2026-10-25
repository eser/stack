// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import * as results from "@eserstack/primitives/results";
import * as toolArguments from "./tool-arguments.ts";
import * as toolDefinitions from "./tool-definitions.ts";

const schemaOf = (name: string): toolArguments.ToolSchema => {
  const definition = toolDefinitions.postToolDefinitions.find(
    (d) => d.name === name,
  );
  if (definition === undefined) throw new Error(`no tool named ${name}`);
  return definition.parameters as toolArguments.ToolSchema;
};

const issuesOf = (
  name: string,
  args: unknown,
): readonly toolArguments.ToolArgumentIssue[] => {
  const result = toolArguments.validateToolArguments(schemaOf(name), args);
  return results.isFail(result) ? result.error : [];
};

/** Every key of a schema and its nested schemas. */
const schemaKeywords = (
  schema: Readonly<Record<string, unknown>>,
): string[] => {
  const keywords = Object.keys(schema);
  const properties = schema["properties"];
  if (properties instanceof Object) {
    for (const nested of Object.values(properties)) {
      keywords.push(...schemaKeywords(nested as Record<string, unknown>));
    }
  }
  const items = schema["items"];
  if (items instanceof Object) {
    keywords.push(...schemaKeywords(items as Record<string, unknown>));
  }
  return keywords;
};

bdd.describe("validateToolArguments", () => {
  const rejected: ReadonlyArray<{
    readonly name: string;
    readonly tool: string;
    readonly args: unknown;
    readonly field: string;
    readonly problem: string;
  }> = [
    {
      name: "a missing required field",
      tool: "compose_post",
      args: {},
      field: "text",
      problem: "is required",
    },
    {
      name: "a platform outside the enum",
      tool: "repost",
      args: { id: "1234567890", platform: "mastodon" },
      field: "platform",
      problem: 'must be one of "twitter", "bluesky"; got "mastodon"',
    },
    {
      name: "a number where a string belongs",
      tool: "compose_post",
      args: { text: 42 },
      field: "text",
      problem: "must be a string; got 42",
    },
    {
      name: "a string where an integer belongs",
      tool: "search_posts",
      args: { query: "deno", platform: "twitter", maxResults: "5" },
      field: "maxResults",
      problem: 'must be an integer; got "5"',
    },
    {
      name: "a fractional number where an integer belongs",
      tool: "search_posts_all",
      args: { query: "deno", maxResultsPerPlatform: 2.5 },
      field: "maxResultsPerPlatform",
      problem: "must be an integer; got 2.5",
    },
    {
      name: "an integer below the minimum",
      tool: "search_posts",
      args: { query: "deno", platform: "bluesky", maxResults: 0 },
      field: "maxResults",
      problem: "must be at least 1; got 0",
    },
    {
      name: "a thread shorter than minItems",
      tool: "post_thread",
      args: { texts: ["only one"] },
      field: "texts",
      problem: "must have at least 2 items; got 1",
    },
    {
      name: "a thread item of the wrong type",
      tool: "post_thread",
      args: { texts: ["first", null] },
      field: "texts[1]",
      problem: "must be a string; got null",
    },
    {
      name: "an empty post text",
      tool: "reply_to_post",
      args: { text: "", inReplyToId: "1234567890", platform: "twitter" },
      field: "text",
      problem: "must not be empty",
    },
    {
      name: "a post ID that is a path instead of an ID",
      tool: "remove_bookmark",
      args: { id: "../../../tweets/1234567890", platform: "twitter" },
      field: "id",
      problem:
        'must match the pattern ^(?:[0-9]{1,19}|at://\\S+)$; got "../../../tweets/1234567890"',
    },
    {
      name: "a misspelled optional argument",
      tool: "compose_post",
      args: { text: "Hello", plaform: "bluesky" },
      field: "plaform",
      problem:
        "is not a parameter of this tool; its parameters are text, platform",
    },
    {
      name: "an inherited property name",
      tool: "get_post",
      args: { id: "1234567890", platform: "twitter", constructor: "x" },
      field: "constructor",
      problem:
        "is not a parameter of this tool; its parameters are id, platform",
    },
  ];

  for (const { name, tool, args, field, problem } of rejected) {
    bdd.it(`rejects ${name} and names the field`, () => {
      assert.assertEquals(issuesOf(tool, args), [{ field, problem }]);
    });
  }

  bdd.it("rejects arguments that are not an object", () => {
    assert.assertEquals(issuesOf("compose_post", ["Hello"]), [
      { field: "", problem: "must be an object; got an array" },
    ]);
  });

  bdd.it("reports every bad argument at once", () => {
    const issues = issuesOf("quote_post", { text: 7, platform: "x" });
    assert.assertEquals(
      issues.map((issue) => issue.field),
      ["quotedPostId", "text", "platform"],
    );
  });

  bdd.it("shortens a long string it quotes back", () => {
    const [issue] = issuesOf("get_post", {
      id: "x".repeat(500),
      platform: "twitter",
    });
    assert.assertStringIncludes(issue?.problem ?? "", `"${"x".repeat(40)}..."`);
    assert.assertEquals((issue?.problem ?? "").includes("x".repeat(41)), false);
  });

  const accepted: ReadonlyArray<{
    readonly tool: string;
    readonly args: Readonly<Record<string, unknown>>;
  }> = [
    { tool: "compose_post", args: { text: "Hello" } },
    { tool: "compose_post", args: { text: "Hello", platform: "bluesky" } },
    {
      tool: "post_thread",
      args: { texts: ["one", "two"], platform: "twitter" },
    },
    {
      tool: "quote_post",
      args: {
        text: "Look",
        quotedPostId: "at://did:plc:abc/app.bsky.feed.post/3k",
        platform: "bluesky",
      },
    },
    {
      tool: "search_posts",
      args: { query: "deno", platform: "twitter", maxResults: 10 },
    },
  ];

  for (const { tool, args } of accepted) {
    bdd.it(`accepts valid ${tool} arguments ${JSON.stringify(args)}`, () => {
      const result = toolArguments.validateToolArguments(schemaOf(tool), args);
      assert.assert(results.isOk(result));
      assert.assertEquals(result.value, args);
    });
  }
});

bdd.describe("postToolDefinitions schemas", () => {
  bdd.it("use only keywords validateToolArguments enforces", () => {
    for (const definition of toolDefinitions.postToolDefinitions) {
      if (definition.parameters === undefined) continue;
      const unsupported = schemaKeywords(definition.parameters).filter(
        (keyword) => !toolArguments.SUPPORTED_SCHEMA_KEYWORDS.has(keyword),
      );
      assert.assertEquals(unsupported, [], definition.name);
    }
  });

  bdd.it("declare every required argument as a property", () => {
    for (const definition of toolDefinitions.postToolDefinitions) {
      const schema = definition.parameters as toolArguments.ToolSchema;
      if (schema.required === undefined) continue;
      const declared =
        schema.properties !== undefined ? Object.keys(schema.properties) : [];
      for (const name of schema.required) {
        assert.assertArrayIncludes(declared, [name], definition.name);
      }
    }
  });
});

bdd.describe("describeArgumentIssues", () => {
  bdd.it("names the tool, each bad argument and the next step", () => {
    const message = toolArguments.describeArgumentIssues("repost", [
      { field: "platform", problem: 'must be one of "twitter", "bluesky"' },
      { field: "", problem: "must be an object" },
    ]);
    assert.assertEquals(
      message,
      'repost did not run because its arguments do not match the tool schema: argument "platform" must be one of "twitter", "bluesky"; the arguments must be an object. Correct the arguments and call repost again.',
    );
  });

  bdd.it("lists at most ten issues and counts the rest", () => {
    const issues = Array.from({ length: 12 }, (_, index) => ({
      field: `extra${index}`,
      problem: "is not a parameter of this tool",
    }));
    const message = toolArguments.describeArgumentIssues("get_post", issues);
    assert.assertStringIncludes(message, 'argument "extra9"');
    assert.assertEquals(message.includes('argument "extra10"'), false);
    assert.assertStringIncludes(message, "; 2 more not shown.");
  });
});

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import type * as types from "./types.ts";
import * as matcher from "./matcher.ts";

const route = (path: string): types.RouteDefinition => ({
  path,
  component: path,
});

const matchCases: ReadonlyArray<{
  readonly name: string;
  readonly pathname: string;
  readonly pattern: string;
  readonly expected: types.RouteParams | null;
}> = [
  {
    name: "matches a static path with no params",
    pathname: "/about",
    pattern: "/about",
    expected: {},
  },
  {
    name: "extracts a dynamic segment",
    pathname: "/stories/hello-world",
    pattern: "/stories/[slug]",
    expected: { slug: "hello-world" },
  },
  {
    name: "extracts several dynamic segments",
    pathname: "/users/42/posts/7",
    pattern: "/users/[userId]/posts/[postId]",
    expected: { userId: "42", postId: "7" },
  },
  {
    name: "extracts a catch-all as a list of segments",
    pathname: "/docs/guide/routing/basics",
    pattern: "/docs/[...path]",
    expected: { path: ["guide", "routing", "basics"] },
  },
  {
    name: "returns an empty catch-all list for the bare prefix",
    pathname: "/docs/",
    pattern: "/docs/[...path]",
    expected: { path: [] },
  },
  {
    name: "returns an empty catch-all list for the bare prefix without a slash",
    pathname: "/docs",
    pattern: "/docs/[...path]",
    expected: { path: [] },
  },
  {
    name: "rejects a word that only starts with the catch-all's prefix",
    pathname: "/docsx",
    pattern: "/docs/[...path]",
    expected: null,
  },
  {
    name: "decodes a dynamic segment",
    pathname: "/stories/hello%20world",
    pattern: "/stories/[slug]",
    expected: { slug: "hello world" },
  },
  {
    name: "decodes each catch-all segment and keeps an encoded slash inside it",
    pathname: "/docs/caf%C3%A9/a%2Fb",
    pattern: "/docs/[...path]",
    expected: { path: ["café", "a/b"] },
  },
  {
    name: "keeps a segment with a malformed escape as written",
    pathname: "/stories/100%",
    pattern: "/stories/[slug]",
    expected: { slug: "100%" },
  },
  {
    name: "rejects a different static path",
    pathname: "/contact",
    pattern: "/about",
    expected: null,
  },
  {
    name: "rejects a path with more segments than a dynamic pattern",
    pathname: "/stories/hello/comments",
    pattern: "/stories/[slug]",
    expected: null,
  },
  {
    name: "rejects an empty dynamic segment",
    pathname: "/stories/",
    pattern: "/stories/[slug]",
    expected: null,
  },
  {
    name: "treats a dot in a pattern as a literal",
    pathname: "/feedXxml",
    pattern: "/feed.xml",
    expected: null,
  },
  {
    name: "matches a pattern with a literal dot",
    pathname: "/feed.xml",
    pattern: "/feed.xml",
    expected: {},
  },
];

for (const { name, pathname, pattern, expected } of matchCases) {
  Deno.test(`matchRoute ${name}`, () => {
    assert.assertEquals(matcher.matchRoute(pathname, route(pattern)), expected);
  });
}

Deno.test("matchRoute returns a catch-all list the caller may change", () => {
  const params = matcher.matchRoute("/docs/a/b", route("/docs/[...path]"));

  assert.assertNotEquals(params, null);
  const segments = params?.["path"];
  assert.assert(Array.isArray(segments));
  segments.push("c");
  assert.assertEquals(
    matcher.matchRoute("/docs/a/b", route("/docs/[...path]")),
    { path: ["a", "b"] },
  );
});

Deno.test("findMatchingRoute returns the first route that matches", () => {
  const featured = route("/stories/featured");
  const story = route("/stories/[slug]");

  assert.assertEquals(
    matcher.findMatchingRoute("/stories/featured", [featured, story]),
    { route: featured, params: {} },
  );
  assert.assertEquals(
    matcher.findMatchingRoute("/stories/hello", [featured, story]),
    { route: story, params: { slug: "hello" } },
  );
});

Deno.test("findMatchingRoute lets an earlier, broader route shadow a later one", () => {
  const story = route("/stories/[slug]");
  const featured = route("/stories/featured");

  const match = matcher.findMatchingRoute("/stories/featured", [
    story,
    featured,
  ]);

  assert.assertStrictEquals(match?.route, story);
});

Deno.test("matchRoute reads only the path of the route it is given", () => {
  assert.assertEquals(
    matcher.matchRoute("/api/items/42", { path: "/api/items/[id]" }),
    { id: "42" },
  );
});

for (const pathname of ["/docs", "/docs/", "/docs/guide/"]) {
  Deno.test(`findMatchingRoute sends "${pathname}" and its normalized form to the same catch-all`, () => {
    const index = route("/");
    const docs = route("/docs/[...path]");

    const match = matcher.findMatchingRoute(pathname, [index, docs]);

    assert.assertStrictEquals(match?.route, docs);
    assert.assertEquals(
      matcher.findMatchingRoute(matcher.normalizePath(pathname), [index, docs]),
      match,
    );
  });
}

Deno.test("findMatchingRoute returns null when no route matches", () => {
  assert.assertEquals(
    matcher.findMatchingRoute("/missing", [route("/"), route("/about")]),
    null,
  );
  assert.assertEquals(matcher.findMatchingRoute("/about", []), null);
});

const normalizeCases: ReadonlyArray<readonly [string, string]> = [
  ["", "/"],
  ["/", "/"],
  ["stories/hello", "/stories/hello"],
  ["/stories/hello/", "/stories/hello"],
  ["stories/", "/stories"],
  ["/stories", "/stories"],
];

for (const [input, expected] of normalizeCases) {
  Deno.test(`normalizePath("${input}") is "${expected}"`, () => {
    assert.assertEquals(matcher.normalizePath(input), expected);
  });
}

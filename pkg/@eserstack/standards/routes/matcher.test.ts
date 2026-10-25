// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as matcher from "./matcher.ts";

Deno.test("compilePattern - static route", () => {
  const compiled = matcher.compilePattern("/about");
  assert.assertEquals(compiled.paramNames, []);
  assert.assertEquals(compiled.catchAllParams.size, 0);
  assert.assertEquals(compiled.regex.test("/about"), true);
  assert.assertEquals(compiled.regex.test("/about/us"), false);
});

Deno.test("compilePattern - single dynamic segment", () => {
  const compiled = matcher.compilePattern("/stories/[slug]");
  assert.assertEquals(compiled.paramNames, ["slug"]);
  assert.assertEquals(compiled.catchAllParams.size, 0);
  assert.assertEquals(compiled.regex.test("/stories/hello"), true);
  assert.assertEquals(compiled.regex.test("/stories/hello/world"), false);
});

Deno.test("compilePattern - multiple dynamic segments", () => {
  const compiled = matcher.compilePattern("/[category]/[id]");
  assert.assertEquals(compiled.paramNames, ["category", "id"]);
  assert.assertEquals(compiled.catchAllParams.size, 0);
});

Deno.test("compilePattern - catch-all segment", () => {
  const compiled = matcher.compilePattern("/docs/[...path]");
  assert.assertEquals(compiled.paramNames, ["path"]);
  assert.assertEquals(compiled.catchAllParams.has("path"), true);
  assert.assertEquals(compiled.regex.test("/docs/a/b/c"), true);
  assert.assertEquals(compiled.regex.test("/docs/"), true);
  assert.assertEquals(compiled.regex.test("/docs"), true);
  assert.assertEquals(compiled.regex.test("/docsx"), false);
});

Deno.test("matchPattern - extracts single param", () => {
  const compiled = matcher.compilePattern("/stories/[slug]");
  const params = matcher.matchPattern("/stories/hello", compiled);
  assert.assertEquals(params, { slug: "hello" });
});

Deno.test("matchPattern - extracts multiple params", () => {
  const compiled = matcher.compilePattern("/[category]/[id]");
  const params = matcher.matchPattern("/tech/42", compiled);
  assert.assertEquals(params, { category: "tech", id: "42" });
});

Deno.test("matchPattern - extracts catch-all as array", () => {
  const compiled = matcher.compilePattern("/docs/[...path]");
  const params = matcher.matchPattern("/docs/a/b/c", compiled);
  assert.assertEquals(params, { path: ["a", "b", "c"] });
});

Deno.test("matchPattern - empty catch-all returns empty array", () => {
  const compiled = matcher.compilePattern("/docs/[...path]");
  const params = matcher.matchPattern("/docs/", compiled);
  assert.assertEquals(params, { path: [] });
});

const matchCases: ReadonlyArray<{
  readonly name: string;
  readonly pathname: string;
  readonly pattern: string;
  readonly expected: Record<string, string | readonly string[]> | null;
}> = [
  {
    name: "decodes a param",
    pathname: "/stories/hello%20world",
    pattern: "/stories/[slug]",
    expected: { slug: "hello world" },
  },
  {
    name: "decodes a multi-byte character",
    pathname: "/stories/caf%C3%A9",
    pattern: "/stories/[slug]",
    expected: { slug: "café" },
  },
  {
    name: "keeps a decoded slash inside the param",
    pathname: "/stories/a%2Fb",
    pattern: "/stories/[slug]",
    expected: { slug: "a/b" },
  },
  {
    name: "keeps a param with a malformed escape as written",
    pathname: "/stories/100%",
    pattern: "/stories/[slug]",
    expected: { slug: "100%" },
  },
  {
    name: "decodes each catch-all segment after splitting",
    pathname: "/docs/a%2Fb/hello%20world",
    pattern: "/docs/[...path]",
    expected: { path: ["a/b", "hello world"] },
  },
  {
    name: "keeps a catch-all segment with a malformed escape as written",
    pathname: "/docs/%E0%A4%A/guide",
    pattern: "/docs/[...path]",
    expected: { path: ["%E0%A4%A", "guide"] },
  },
  {
    name: "drops empty catch-all segments",
    pathname: "/docs//a/",
    pattern: "/docs/[...path]",
    expected: { path: ["a"] },
  },
  {
    name: "matches a catch-all's bare prefix",
    pathname: "/docs",
    pattern: "/docs/[...path]",
    expected: { path: [] },
  },
  {
    name: "matches a catch-all's bare prefix with a trailing slash",
    pathname: "/docs/",
    pattern: "/docs/[...path]",
    expected: { path: [] },
  },
  {
    name: "rejects a longer word that starts with the prefix",
    pathname: "/docsx",
    pattern: "/docs/[...path]",
    expected: null,
  },
  {
    name: "rejects a shorter prefix",
    pathname: "/doc",
    pattern: "/docs/[...path]",
    expected: null,
  },
  {
    name: "matches the root with a root catch-all",
    pathname: "/",
    pattern: "/[...path]",
    expected: { path: [] },
  },
  {
    name: "matches every path with a root catch-all",
    pathname: "/a/b",
    pattern: "/[...path]",
    expected: { path: ["a", "b"] },
  },
  {
    name: "matches a catch-all with no segments before a static suffix",
    pathname: "/docs/edit",
    pattern: "/docs/[...path]/edit",
    expected: { path: [] },
  },
  {
    name: "matches a catch-all with segments before a static suffix",
    pathname: "/docs/a/b/edit",
    pattern: "/docs/[...path]/edit",
    expected: { path: ["a", "b"] },
  },
  {
    name: "matches a catch-all after a param",
    pathname: "/en",
    pattern: "/[lang]/[...path]",
    expected: { lang: "en", path: [] },
  },
  {
    name: "requires the slash before a catch-all that follows other text",
    pathname: "/files",
    pattern: "/files-[...rest]",
    expected: null,
  },
];

for (const { name, pathname, pattern, expected } of matchCases) {
  Deno.test(`matchRoute ${name}`, () => {
    assert.assertEquals(matcher.matchRoute(pathname, pattern), expected);
  });
}

const catchAllPaths: ReadonlyArray<string> = [
  "/docs",
  "/docs/",
  "/docs/guide",
  "/docs/guide/",
  "/docs/guide/routing/",
];

for (const pathname of catchAllPaths) {
  Deno.test(`matchRoute gives "${pathname}" and its normalized form the same catch-all params`, () => {
    const pattern = "/docs/[...path]";
    const params = matcher.matchRoute(pathname, pattern);

    assert.assertNotEquals(params, null);
    assert.assertEquals(
      matcher.matchRoute(matcher.normalizePath(pathname), pattern),
      params,
    );
  });
}

Deno.test("findMatchingRoute sends a normalized index path to its catch-all", () => {
  const routes = [{ path: "/docs/[...path]", data: "docs" }];

  const result = matcher.findMatchingRoute(
    matcher.normalizePath("/docs/"),
    routes,
  );

  assert.assertEquals(result?.route.data, "docs");
  assert.assertEquals(result?.params, { path: [] });
});

Deno.test("findMatchingRoute prefers a static index page listed before a catch-all", () => {
  const routes = [
    { path: "/docs", data: "index" },
    { path: "/docs/[...path]", data: "docs" },
  ];

  const result = matcher.findMatchingRoute("/docs", routes);

  assert.assertEquals(result?.route.data, "index");
});

Deno.test("matchPattern - returns null on no match", () => {
  const compiled = matcher.compilePattern("/stories/[slug]");
  const params = matcher.matchPattern("/about", compiled);
  assert.assertEquals(params, null);
});

Deno.test("matchRoute - convenience function", () => {
  const params = matcher.matchRoute("/stories/hello", "/stories/[slug]");
  assert.assertEquals(params, { slug: "hello" });
});

Deno.test("matchRoute - returns null on no match", () => {
  const params = matcher.matchRoute("/about", "/stories/[slug]");
  assert.assertEquals(params, null);
});

Deno.test("findMatchingRoute - finds first match", () => {
  const routes = [
    { path: "/stories/featured", data: "featured" },
    { path: "/stories/[slug]", data: "story" },
  ];

  const result = matcher.findMatchingRoute("/stories/featured", routes);
  assert.assertEquals(result?.route.data, "featured");
  assert.assertEquals(result?.params, {});
});

Deno.test("findMatchingRoute - falls back to dynamic route", () => {
  const routes = [
    { path: "/stories/featured", data: "featured" },
    { path: "/stories/[slug]", data: "story" },
  ];

  const result = matcher.findMatchingRoute("/stories/hello", routes);
  assert.assertEquals(result?.route.data, "story");
  assert.assertEquals(result?.params, { slug: "hello" });
});

Deno.test("findMatchingRoute - returns null when no routes match", () => {
  const routes = [{ path: "/stories/[slug]", data: "story" }];

  const result = matcher.findMatchingRoute("/about", routes);
  assert.assertEquals(result, null);
});

Deno.test("normalizePath - ensures leading slash", () => {
  assert.assertEquals(matcher.normalizePath("stories/hello"), "/stories/hello");
});

Deno.test("normalizePath - removes trailing slash", () => {
  assert.assertEquals(
    matcher.normalizePath("/stories/hello/"),
    "/stories/hello",
  );
});

Deno.test("normalizePath - preserves root", () => {
  assert.assertEquals(matcher.normalizePath("/"), "/");
  assert.assertEquals(matcher.normalizePath(""), "/");
});

Deno.test("normalizePath - handles already normalized", () => {
  assert.assertEquals(
    matcher.normalizePath("/stories/hello"),
    "/stories/hello",
  );
});

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import {
  compilePattern,
  findMatchingRoute,
  matchPattern,
  matchRoute,
  normalizePath,
} from "./matcher.ts";

Deno.test("compilePattern - static route", () => {
  const compiled = compilePattern("/about");
  assert.assertEquals(compiled.paramNames, []);
  assert.assertEquals(compiled.catchAllParams.size, 0);
  assert.assertEquals(compiled.regex.test("/about"), true);
  assert.assertEquals(compiled.regex.test("/about/us"), false);
});

Deno.test("compilePattern - single dynamic segment", () => {
  const compiled = compilePattern("/stories/[slug]");
  assert.assertEquals(compiled.paramNames, ["slug"]);
  assert.assertEquals(compiled.catchAllParams.size, 0);
  assert.assertEquals(compiled.regex.test("/stories/hello"), true);
  assert.assertEquals(compiled.regex.test("/stories/hello/world"), false);
});

Deno.test("compilePattern - multiple dynamic segments", () => {
  const compiled = compilePattern("/[category]/[id]");
  assert.assertEquals(compiled.paramNames, ["category", "id"]);
  assert.assertEquals(compiled.catchAllParams.size, 0);
});

Deno.test("compilePattern - catch-all segment", () => {
  const compiled = compilePattern("/docs/[...path]");
  assert.assertEquals(compiled.paramNames, ["path"]);
  assert.assertEquals(compiled.catchAllParams.has("path"), true);
  assert.assertEquals(compiled.regex.test("/docs/a/b/c"), true);
  assert.assertEquals(compiled.regex.test("/docs/"), true);
});

Deno.test("matchPattern - extracts single param", () => {
  const compiled = compilePattern("/stories/[slug]");
  const params = matchPattern("/stories/hello", compiled);
  assert.assertEquals(params, { slug: "hello" });
});

Deno.test("matchPattern - extracts multiple params", () => {
  const compiled = compilePattern("/[category]/[id]");
  const params = matchPattern("/tech/42", compiled);
  assert.assertEquals(params, { category: "tech", id: "42" });
});

Deno.test("matchPattern - extracts catch-all as array", () => {
  const compiled = compilePattern("/docs/[...path]");
  const params = matchPattern("/docs/a/b/c", compiled);
  assert.assertEquals(params, { path: ["a", "b", "c"] });
});

Deno.test("matchPattern - empty catch-all returns empty array", () => {
  const compiled = compilePattern("/docs/[...path]");
  const params = matchPattern("/docs/", compiled);
  assert.assertEquals(params, { path: [] });
});

Deno.test("matchPattern - returns null on no match", () => {
  const compiled = compilePattern("/stories/[slug]");
  const params = matchPattern("/about", compiled);
  assert.assertEquals(params, null);
});

Deno.test("matchRoute - convenience function", () => {
  const params = matchRoute("/stories/hello", "/stories/[slug]");
  assert.assertEquals(params, { slug: "hello" });
});

Deno.test("matchRoute - returns null on no match", () => {
  const params = matchRoute("/about", "/stories/[slug]");
  assert.assertEquals(params, null);
});

Deno.test("findMatchingRoute - finds first match", () => {
  const routes = [
    { path: "/stories/featured", data: "featured" },
    { path: "/stories/[slug]", data: "story" },
  ];

  const result = findMatchingRoute("/stories/featured", routes);
  assert.assertEquals(result?.route.data, "featured");
  assert.assertEquals(result?.params, {});
});

Deno.test("findMatchingRoute - falls back to dynamic route", () => {
  const routes = [
    { path: "/stories/featured", data: "featured" },
    { path: "/stories/[slug]", data: "story" },
  ];

  const result = findMatchingRoute("/stories/hello", routes);
  assert.assertEquals(result?.route.data, "story");
  assert.assertEquals(result?.params, { slug: "hello" });
});

Deno.test("findMatchingRoute - returns null when no routes match", () => {
  const routes = [
    { path: "/stories/[slug]", data: "story" },
  ];

  const result = findMatchingRoute("/about", routes);
  assert.assertEquals(result, null);
});

Deno.test("normalizePath - ensures leading slash", () => {
  assert.assertEquals(normalizePath("stories/hello"), "/stories/hello");
});

Deno.test("normalizePath - removes trailing slash", () => {
  assert.assertEquals(normalizePath("/stories/hello/"), "/stories/hello");
});

Deno.test("normalizePath - preserves root", () => {
  assert.assertEquals(normalizePath("/"), "/");
  assert.assertEquals(normalizePath(""), "/");
});

Deno.test("normalizePath - handles already normalized", () => {
  assert.assertEquals(normalizePath("/stories/hello"), "/stories/hello");
});

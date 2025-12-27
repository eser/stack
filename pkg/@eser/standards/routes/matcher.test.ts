// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals } from "@std/assert";
import {
  compilePattern,
  findMatchingRoute,
  matchPattern,
  matchRoute,
  normalizePath,
} from "./matcher.ts";

Deno.test("compilePattern - static route", () => {
  const compiled = compilePattern("/about");
  assertEquals(compiled.paramNames, []);
  assertEquals(compiled.catchAllParams.size, 0);
  assertEquals(compiled.regex.test("/about"), true);
  assertEquals(compiled.regex.test("/about/us"), false);
});

Deno.test("compilePattern - single dynamic segment", () => {
  const compiled = compilePattern("/stories/[slug]");
  assertEquals(compiled.paramNames, ["slug"]);
  assertEquals(compiled.catchAllParams.size, 0);
  assertEquals(compiled.regex.test("/stories/hello"), true);
  assertEquals(compiled.regex.test("/stories/hello/world"), false);
});

Deno.test("compilePattern - multiple dynamic segments", () => {
  const compiled = compilePattern("/[category]/[id]");
  assertEquals(compiled.paramNames, ["category", "id"]);
  assertEquals(compiled.catchAllParams.size, 0);
});

Deno.test("compilePattern - catch-all segment", () => {
  const compiled = compilePattern("/docs/[...path]");
  assertEquals(compiled.paramNames, ["path"]);
  assertEquals(compiled.catchAllParams.has("path"), true);
  assertEquals(compiled.regex.test("/docs/a/b/c"), true);
  assertEquals(compiled.regex.test("/docs/"), true);
});

Deno.test("matchPattern - extracts single param", () => {
  const compiled = compilePattern("/stories/[slug]");
  const params = matchPattern("/stories/hello", compiled);
  assertEquals(params, { slug: "hello" });
});

Deno.test("matchPattern - extracts multiple params", () => {
  const compiled = compilePattern("/[category]/[id]");
  const params = matchPattern("/tech/42", compiled);
  assertEquals(params, { category: "tech", id: "42" });
});

Deno.test("matchPattern - extracts catch-all as array", () => {
  const compiled = compilePattern("/docs/[...path]");
  const params = matchPattern("/docs/a/b/c", compiled);
  assertEquals(params, { path: ["a", "b", "c"] });
});

Deno.test("matchPattern - empty catch-all returns empty array", () => {
  const compiled = compilePattern("/docs/[...path]");
  const params = matchPattern("/docs/", compiled);
  assertEquals(params, { path: [] });
});

Deno.test("matchPattern - returns null on no match", () => {
  const compiled = compilePattern("/stories/[slug]");
  const params = matchPattern("/about", compiled);
  assertEquals(params, null);
});

Deno.test("matchRoute - convenience function", () => {
  const params = matchRoute("/stories/hello", "/stories/[slug]");
  assertEquals(params, { slug: "hello" });
});

Deno.test("matchRoute - returns null on no match", () => {
  const params = matchRoute("/about", "/stories/[slug]");
  assertEquals(params, null);
});

Deno.test("findMatchingRoute - finds first match", () => {
  const routes = [
    { path: "/stories/featured", data: "featured" },
    { path: "/stories/[slug]", data: "story" },
  ];

  const result = findMatchingRoute("/stories/featured", routes);
  assertEquals(result?.route.data, "featured");
  assertEquals(result?.params, {});
});

Deno.test("findMatchingRoute - falls back to dynamic route", () => {
  const routes = [
    { path: "/stories/featured", data: "featured" },
    { path: "/stories/[slug]", data: "story" },
  ];

  const result = findMatchingRoute("/stories/hello", routes);
  assertEquals(result?.route.data, "story");
  assertEquals(result?.params, { slug: "hello" });
});

Deno.test("findMatchingRoute - returns null when no routes match", () => {
  const routes = [
    { path: "/stories/[slug]", data: "story" },
  ];

  const result = findMatchingRoute("/about", routes);
  assertEquals(result, null);
});

Deno.test("normalizePath - ensures leading slash", () => {
  assertEquals(normalizePath("stories/hello"), "/stories/hello");
});

Deno.test("normalizePath - removes trailing slash", () => {
  assertEquals(normalizePath("/stories/hello/"), "/stories/hello");
});

Deno.test("normalizePath - preserves root", () => {
  assertEquals(normalizePath("/"), "/");
  assertEquals(normalizePath(""), "/");
});

Deno.test("normalizePath - handles already normalized", () => {
  assertEquals(normalizePath("/stories/hello"), "/stories/hello");
});

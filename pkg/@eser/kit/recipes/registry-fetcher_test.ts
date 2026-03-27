// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { parseGitHubRawUrl } from "./registry-fetcher.ts";

// =============================================================================
// parseGitHubRawUrl
// =============================================================================

Deno.test("parseGitHubRawUrl — parses standard raw URL", () => {
  const result = parseGitHubRawUrl(
    "https://raw.githubusercontent.com/eser/stack/main/etc/registry",
  );

  assert.assertExists(result);
  assert.assertEquals(result!.owner, "eser");
  assert.assertEquals(result!.repo, "stack");
  assert.assertEquals(result!.ref, "main");
  assert.assertEquals(result!.basePath, "etc/registry");
});

Deno.test("parseGitHubRawUrl — parses URL with tag ref", () => {
  const result = parseGitHubRawUrl(
    "https://raw.githubusercontent.com/eser/ajan/v1.0/recipes",
  );

  assert.assertExists(result);
  assert.assertEquals(result!.owner, "eser");
  assert.assertEquals(result!.repo, "ajan");
  assert.assertEquals(result!.ref, "v1.0");
  assert.assertEquals(result!.basePath, "recipes");
});

Deno.test("parseGitHubRawUrl — parses URL without path", () => {
  const result = parseGitHubRawUrl(
    "https://raw.githubusercontent.com/eser/stack/main",
  );

  assert.assertExists(result);
  assert.assertEquals(result!.basePath, "");
});

Deno.test("parseGitHubRawUrl — parses URL with deep path", () => {
  const result = parseGitHubRawUrl(
    "https://raw.githubusercontent.com/eser/stack/dev/a/b/c/d",
  );

  assert.assertExists(result);
  assert.assertEquals(result!.ref, "dev");
  assert.assertEquals(result!.basePath, "a/b/c/d");
});

Deno.test("parseGitHubRawUrl — returns undefined for non-GitHub URL", () => {
  const result = parseGitHubRawUrl("https://example.com/some/path");

  assert.assertEquals(result, undefined);
});

Deno.test("parseGitHubRawUrl — returns undefined for GitHub API URL", () => {
  const result = parseGitHubRawUrl(
    "https://api.github.com/repos/eser/stack/contents/etc",
  );

  assert.assertEquals(result, undefined);
});

Deno.test("parseGitHubRawUrl — returns undefined for empty string", () => {
  const result = parseGitHubRawUrl("");

  assert.assertEquals(result, undefined);
});

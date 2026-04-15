// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { parseSpecifier } from "../recipes/handlers/clone-recipe.ts";

Deno.test("parseSpecifier — owner/repo format", () => {
  const result = parseSpecifier("eser/ajan");

  assert.assertExists(result);
  assert.assertEquals(result!.owner, "eser");
  assert.assertEquals(result!.repo, "ajan");
  assert.assertEquals(result!.ref, "main");
});

Deno.test("parseSpecifier — gh: prefix", () => {
  const result = parseSpecifier("gh:eser/ajan");

  assert.assertExists(result);
  assert.assertEquals(result!.owner, "eser");
  assert.assertEquals(result!.repo, "ajan");
  assert.assertEquals(result!.ref, "main");
});

Deno.test("parseSpecifier — gh: prefix with ref", () => {
  const result = parseSpecifier("gh:eser/ajan#v1.0");

  assert.assertExists(result);
  assert.assertEquals(result!.owner, "eser");
  assert.assertEquals(result!.repo, "ajan");
  assert.assertEquals(result!.ref, "v1.0");
});

Deno.test("parseSpecifier — branch ref", () => {
  const result = parseSpecifier("eser/stack#dev");

  assert.assertExists(result);
  assert.assertEquals(result!.ref, "dev");
});

Deno.test("parseSpecifier — returns undefined for invalid format", () => {
  assert.assertEquals(parseSpecifier("just-a-name"), undefined);
  assert.assertEquals(parseSpecifier(""), undefined);
  assert.assertEquals(parseSpecifier("/repo"), undefined);
  assert.assertEquals(parseSpecifier("owner/"), undefined);
});

Deno.test("parseSpecifier — handles complex repo names", () => {
  const result = parseSpecifier("eser/laroux-template-minimal");

  assert.assertExists(result);
  assert.assertEquals(result!.owner, "eser");
  assert.assertEquals(result!.repo, "laroux-template-minimal");
});

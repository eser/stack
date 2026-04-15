// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as results from "@eserstack/primitives/results";
import { main } from "./list.ts";

const REGISTRY_PATH = new URL(
  "../../../../.eser/recipes.json",
  import.meta.url,
).pathname;

Deno.test("list — succeeds with local registry", async () => {
  const result = await main(["--registry", REGISTRY_PATH]);

  assert.assertEquals(results.isOk(result), true);
});

Deno.test("list — succeeds with language filter", async () => {
  const result = await main([
    "--registry",
    REGISTRY_PATH,
    "--language",
    "typescript",
  ]);

  assert.assertEquals(results.isOk(result), true);
});

Deno.test("list — succeeds with no matches", async () => {
  const result = await main([
    "--registry",
    REGISTRY_PATH,
    "--language",
    "rust",
  ]);

  assert.assertEquals(results.isOk(result), true);
});

Deno.test("list — succeeds with scale filter", async () => {
  const result = await main([
    "--registry",
    REGISTRY_PATH,
    "--scale",
    "utility",
  ]);

  assert.assertEquals(results.isOk(result), true);
});

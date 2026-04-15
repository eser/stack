// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as results from "@eserstack/primitives/results";
import { main } from "./new.ts";

const REGISTRY_PATH = new URL(
  "../../../../.eser/recipes.json",
  import.meta.url,
).pathname;

Deno.test("new — succeeds with no arg (shows templates)", async () => {
  const result = await main(["--registry", REGISTRY_PATH]);

  assert.assertEquals(results.isOk(result), true);
});

Deno.test("new — fails for unknown template", async () => {
  const result = await main([
    "nonexistent",
    "--registry",
    REGISTRY_PATH,
  ]);

  assert.assertEquals(results.isOk(result), false);
});

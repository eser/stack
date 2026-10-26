// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as results from "@eserstack/primitives/results";
import * as update from "./update.ts";

nodeTest.test("update — parseCliArgs reads the recipe and every flag", () => {
  const parsed = update.parseCliArgs([
    "fp-pipe",
    "--registry",
    "registry.json",
    "--dry-run",
    "--verbose",
    "--local",
  ]);

  assert.assertEquals(parsed.positionals, ["fp-pipe"]);
  assert.assertEquals(parsed.values["registry"], "registry.json");
  assert.assertEquals(parsed.values["dry-run"], true);
  assert.assertEquals(parsed.values["verbose"], true);
  assert.assertEquals(parsed.values["local"], true);
});

nodeTest.test("update — parseCliArgs leaves absent flags out", () => {
  const parsed = update.parseCliArgs([]);

  assert.assertEquals(parsed.positionals, []);
  assert.assertEquals(parsed.values["dry-run"], undefined);
});

nodeTest.test("update — succeeds with no recipe (shows usage)", async () => {
  const result = await update.main([]);

  assert.assertEquals(results.isOk(result), true);
});

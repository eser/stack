// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as path from "@std/path";
import * as results from "@eserstack/primitives/results";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as newCommand from "./new.ts";

const REGISTRY_PATH = path.fromFileUrl(
  new URL("../../../../.eser/recipes.json", import.meta.url),
);

Deno.test("new — succeeds with no arg (shows templates)", async () => {
  const result = await newCommand.main(["--registry", REGISTRY_PATH]);

  assert.assertEquals(results.isOk(result), true);
});

Deno.test("new — fails for unknown template", async () => {
  const result = await newCommand.main([
    "nonexistent",
    "--registry",
    REGISTRY_PATH,
  ]);

  assert.assertEquals(results.isOk(result), false);
});

Deno.test("new: exits 1 with the cause when the template list cannot load", async () => {
  const dir = await runtime.fs.makeTempDir({ prefix: "kit-new-test-" });
  const registryPath = runtime.path.join(dir, "recipes.json");

  try {
    await runtime.fs.writeTextFile(registryPath, "{ not json");

    const result = await newCommand.main(["--registry", registryPath]);

    assert.assertEquals(results.isFail(result), true);
    if (results.isFail(result)) {
      const [first, second] = (result.error.message ?? "").split("\n");
      assert.assertEquals(
        first,
        `load registry ${registryPath}: the manifest is not valid JSON`,
      );
      assert.assertStringIncludes(second ?? "", "  caused by: ");
      assert.assertEquals(result.error.exitCode, 1);
    }
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
});

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as path from "@std/path";
import * as results from "@eserstack/primitives/results";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as list from "./list.ts";

const REGISTRY_PATH = path.fromFileUrl(
  new URL("../../../../.eser/recipes.json", import.meta.url),
);

nodeTest.test("list — succeeds with local registry", async () => {
  const result = await list.main(["--registry", REGISTRY_PATH]);

  assert.assertEquals(results.isOk(result), true);
});

nodeTest.test("list — succeeds with language filter", async () => {
  const result = await list.main([
    "--registry",
    REGISTRY_PATH,
    "--language",
    "typescript",
  ]);

  assert.assertEquals(results.isOk(result), true);
});

nodeTest.test("list — succeeds with no matches", async () => {
  const result = await list.main([
    "--registry",
    REGISTRY_PATH,
    "--language",
    "rust",
  ]);

  assert.assertEquals(results.isOk(result), true);
});

nodeTest.test("list — succeeds with scale filter", async () => {
  const result = await list.main([
    "--registry",
    REGISTRY_PATH,
    "--scale",
    "utility",
  ]);

  assert.assertEquals(results.isOk(result), true);
});

nodeTest.test("list: reports a bad registry file with its cause", async () => {
  const dir = await runtime.fs.makeTempDir({ prefix: "kit-list-test-" });
  const registryPath = runtime.path.join(dir, "recipes.json");

  try {
    await runtime.fs.writeTextFile(registryPath, "{ not json");

    const result = await list.main(["--registry", registryPath]);

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

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as results from "@eserstack/primitives/results";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as newCommand from "./new.ts";

const REGISTRY_PATH = runtime.path.join(
  import.meta.dirname,
  "../../../../.eser/recipes.json",
);

nodeTest.test("new — succeeds with no arg (shows templates)", async () => {
  const result = await newCommand.main(["--registry", REGISTRY_PATH]);

  assert.assertEquals(results.isOk(result), true);
});

nodeTest.test("new — fails for unknown template", async () => {
  const result = await newCommand.main([
    "nonexistent",
    "--registry",
    REGISTRY_PATH,
  ]);

  assert.assertEquals(results.isOk(result), false);
});

nodeTest.test(
  "new: exits 1 with the cause when the template list cannot load",
  async () => {
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
  },
);

nodeTest.test("new — parseCliArgs reads every flag and repeats --var", () => {
  const parsed = newCommand.parseCliArgs([
    "library-pkg",
    "--name",
    "demo",
    "--registry=registry.json",
    "--var",
    "a=1",
    "--var",
    "b=2",
    "--local",
    "-i",
    "--no-post-install",
  ]);

  assert.assertEquals(parsed.positionals, ["library-pkg"]);
  assert.assertEquals(parsed.values["name"], "demo");
  assert.assertEquals(parsed.values["registry"], "registry.json");
  assert.assertEquals(parsed.values["var"], ["a=1", "b=2"]);
  assert.assertEquals(parsed.values["local"], true);
  assert.assertEquals(parsed.values["interactive"], true);
  assert.assertEquals(parsed.values["no-post-install"], true);
});

nodeTest.test(
  "new — parseCliArgs reads --no-interactive and defaults --var",
  () => {
    const parsed = newCommand.parseCliArgs(["library-pkg", "--no-interactive"]);

    assert.assertEquals(parsed.values["no-interactive"], true);
    assert.assertEquals(parsed.values["interactive"], undefined);
    assert.assertEquals(parsed.values["var"], []);
  },
);

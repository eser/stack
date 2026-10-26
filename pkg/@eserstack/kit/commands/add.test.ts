// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as results from "@eserstack/primitives/results";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as add from "./add.ts";

const REGISTRY_PATH = runtime.path.join(
  import.meta.dirname,
  "../../../../.eser/recipes.json",
);

nodeTest.test("add — succeeds with no recipe (shows usage)", async () => {
  const result = await add.main(["--registry", REGISTRY_PATH]);

  assert.assertEquals(results.isOk(result), true);
});

nodeTest.test("add — fails for unknown recipe", async () => {
  const result = await add.main(["nonexistent", "--registry", REGISTRY_PATH]);

  assert.assertEquals(results.isOk(result), false);
});

nodeTest.test("add — dry-run succeeds without writing files", async () => {
  const tmpDir = await runtime.fs.makeTempDir();

  try {
    const result = await add.main([
      "--cwd",
      tmpDir,
      "fp-pipe",
      "--registry",
      REGISTRY_PATH,
      "--dry-run",
    ]);

    assert.assertEquals(results.isOk(result), true);

    // Verify no files were written
    let fileExists = false;
    try {
      await runtime.fs.stat(`${tmpDir}/lib/fp/pipe.ts`);
      fileExists = true;
    } catch {
      // expected
    }

    assert.assertEquals(fileExists, false);
  } finally {
    await runtime.fs.remove(tmpDir, { recursive: true });
  }
});

nodeTest.test("add — parseCliArgs reads every flag and repeats --var", () => {
  const parsed = add.parseCliArgs([
    "fp-pipe",
    "--registry",
    "registry.json",
    "--cwd=/work",
    "--var",
    "name=demo",
    "--var",
    "scope=@x",
    "--dry-run",
    "--force",
    "--skip-existing",
    "--verbose",
    "--local",
    "--no-install",
  ]);

  assert.assertEquals(parsed.positionals, ["fp-pipe"]);
  assert.assertEquals(parsed.values["registry"], "registry.json");
  assert.assertEquals(parsed.values["cwd"], "/work");
  assert.assertEquals(parsed.values["var"], ["name=demo", "scope=@x"]);
  for (const flag of [
    "dry-run",
    "force",
    "skip-existing",
    "verbose",
    "local",
    "no-install",
  ]) {
    assert.assertEquals(parsed.values[flag], true, flag);
  }
});

nodeTest.test("add — parseCliArgs defaults --var to an empty list", () => {
  const parsed = add.parseCliArgs([]);

  assert.assertEquals(parsed.values["var"], []);
  assert.assertEquals(parsed.values["dry-run"], undefined);
  assert.assertEquals(parsed.positionals, []);
});

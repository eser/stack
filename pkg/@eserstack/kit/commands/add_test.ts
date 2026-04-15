// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as results from "@eserstack/primitives/results";
import { runtime } from "@eserstack/standards/cross-runtime";
import { main } from "./add.ts";

const REGISTRY_PATH = new URL(
  "../../../../.eser/recipes.json",
  import.meta.url,
).pathname;

Deno.test("add — succeeds with no recipe (shows usage)", async () => {
  const result = await main(["--registry", REGISTRY_PATH]);

  assert.assertEquals(results.isOk(result), true);
});

Deno.test("add — fails for unknown recipe", async () => {
  const result = await main([
    "nonexistent",
    "--registry",
    REGISTRY_PATH,
  ]);

  assert.assertEquals(results.isOk(result), false);
});

Deno.test("add — dry-run succeeds without writing files", async () => {
  const tmpDir = await runtime.fs.makeTempDir();
  const origCwd = runtime.process.cwd();

  try {
    runtime.process.chdir(tmpDir);

    const result = await main([
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
    runtime.process.chdir(origCwd);
    await runtime.fs.remove(tmpDir, { recursive: true });
  }
});

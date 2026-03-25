// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as results from "@eser/primitives/results";
import { main } from "./add.ts";

const REGISTRY_PATH = new URL(
  "../../../../etc/registry/eser-registry.json",
  import.meta.url,
).pathname;

Deno.test("add — shows usage when no recipe specified", async () => {
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (msg: string) => logs.push(String(msg));

  try {
    const result = await main(["--registry", REGISTRY_PATH]);

    assert.assertEquals(results.isOk(result), true);
    const output = logs.join("\n");
    assert.assertStringIncludes(output, "Usage:");
  } finally {
    console.log = origLog;
  }
});

Deno.test("add — reports error for unknown recipe", async () => {
  const errors: string[] = [];
  const origError = console.error;
  console.error = (msg: string) => errors.push(String(msg));

  try {
    const result = await main([
      "nonexistent",
      "--registry",
      REGISTRY_PATH,
    ]);

    assert.assertEquals(results.isOk(result), false);
    assert.assertStringIncludes(errors.join("\n"), "not found");
  } finally {
    console.error = origError;
  }
});

Deno.test("add — dry-run does not write files", async () => {
  const tmpDir = await Deno.makeTempDir();
  const origCwd = Deno.cwd();

  try {
    Deno.chdir(tmpDir);

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(String(msg));

    try {
      const result = await main([
        "fp-pipe",
        "--registry",
        REGISTRY_PATH,
        "--dry-run",
      ]);

      assert.assertEquals(results.isOk(result), true);
      const output = logs.join("\n");
      assert.assertStringIncludes(output, "Would write");
    } finally {
      console.log = origLog;
    }

    // Verify no files were written
    let fileExists = false;
    try {
      await Deno.stat(`${tmpDir}/lib/fp/pipe.ts`);
      fileExists = true;
    } catch {
      // expected
    }

    assert.assertEquals(fileExists, false);
  } finally {
    Deno.chdir(origCwd);
    await Deno.remove(tmpDir, { recursive: true });
  }
});

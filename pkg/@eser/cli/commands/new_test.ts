// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as results from "@eser/primitives/results";
import { main } from "./new.ts";

const REGISTRY_PATH = new URL(
  "../../../../etc/registry/eser-registry.json",
  import.meta.url,
).pathname;

Deno.test("new — shows available templates when no arg", async () => {
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (msg: string) => logs.push(String(msg));

  try {
    const result = await main(["--registry", REGISTRY_PATH]);

    assert.assertEquals(results.isOk(result), true);
    const output = logs.join("\n");
    assert.assertStringIncludes(output, "Available project templates");
    assert.assertStringIncludes(output, "library-pkg");
  } finally {
    console.log = origLog;
  }
});

Deno.test("new — reports error for unknown template", async () => {
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

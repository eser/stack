// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as results from "@eser/primitives/results";
import { main } from "./list.ts";

const REGISTRY_PATH = new URL(
  "../../../../etc/registry/eser-registry.json",
  import.meta.url,
).pathname;

Deno.test("list — lists all recipes from local registry", async () => {
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (msg: string) => logs.push(String(msg));

  try {
    const result = await main(["--registry", REGISTRY_PATH]);

    assert.assertEquals(results.isOk(result), true);
    const output = logs.join("\n");
    assert.assertStringIncludes(output, "library-pkg");
    assert.assertStringIncludes(output, "fp-pipe");
    assert.assertStringIncludes(output, "PROJECTS");
    assert.assertStringIncludes(output, "UTILITIES");
  } finally {
    console.log = origLog;
  }
});

Deno.test("list — filters by language", async () => {
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (msg: string) => logs.push(String(msg));

  try {
    const result = await main([
      "--registry",
      REGISTRY_PATH,
      "--language",
      "typescript",
    ]);

    assert.assertEquals(results.isOk(result), true);
    const output = logs.join("\n");
    assert.assertStringIncludes(output, "library-pkg");
  } finally {
    console.log = origLog;
  }
});

Deno.test("list — shows empty message for no matches", async () => {
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (msg: string) => logs.push(String(msg));

  try {
    const result = await main([
      "--registry",
      REGISTRY_PATH,
      "--language",
      "rust",
    ]);

    assert.assertEquals(results.isOk(result), true);
    const output = logs.join("\n");
    assert.assertStringIncludes(output, "No recipes found");
  } finally {
    console.log = origLog;
  }
});

Deno.test("list — filters by scale", async () => {
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (msg: string) => logs.push(String(msg));

  try {
    const result = await main([
      "--registry",
      REGISTRY_PATH,
      "--scale",
      "utility",
    ]);

    assert.assertEquals(results.isOk(result), true);
    const output = logs.join("\n");
    assert.assertStringIncludes(output, "fp-pipe");
    assert.assertEquals(output.includes("library-pkg"), false);
  } finally {
    console.log = origLog;
  }
});

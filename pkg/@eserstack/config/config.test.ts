// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as config from "./mod.ts";

Deno.test("new Config", () => {
  const result = new config.Config();

  assert.assertInstanceOf(result, config.Config);
});

Deno.test("setting config meta", () => {
  const result = new config.Config();

  result.setKeyMeta("sampleKey", {
    description: "sample description",
    type: "string",
    ttl: 1000,
    disallowSource: ["env"],
  });

  assert.assertInstanceOf(result, config.Config);
});

Deno.test({ name: "FFI round-trip: load values from json_file", sanitizeResources: false }, async () => {
  const tmpDir = await Deno.makeTempDir();
  const configPath = `${tmpDir}/round-trip.json`;
  try {
    await Deno.writeTextFile(
      configPath,
      JSON.stringify({ ESER_TEST_KEY: "hello", ESER_TEST_NUM: 42 }),
    );
    const values = await config.load([
      `json_file:${configPath}` as config.ConfigSource,
    ]);
    assert.assertEquals(values["ESER_TEST_KEY"], "hello");
    assert.assertEquals(values["ESER_TEST_NUM"], "42"); // Go coerces all JSON values to strings
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

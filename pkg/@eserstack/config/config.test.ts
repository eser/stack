// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as config from "./mod.ts";

nodeTest.test("new Config", () => {
  const result = new config.Config();

  assert.assertInstanceOf(result, config.Config);
});

nodeTest.test("setting config meta", () => {
  const result = new config.Config();

  result.setKeyMeta("sampleKey", {
    description: "sample description",
    type: "string",
    ttl: 1000,
    disallowSource: ["env"],
  });

  assert.assertInstanceOf(result, config.Config);
});

nodeTest.test("FFI round-trip: load values from json_file", async () => {
  const tmpDir = await runtime.fs.makeTempDir({ prefix: "config-" });
  const configPath = runtime.path.join(tmpDir, "round-trip.json");
  try {
    await runtime.fs.writeTextFile(
      configPath,
      JSON.stringify({ ESER_TEST_KEY: "hello", ESER_TEST_NUM: 42 }),
    );
    const values = await config.load([
      `json_file:${configPath}` as config.ConfigSource,
    ]);
    assert.assertEquals(values["ESER_TEST_KEY"], "hello");
    assert.assertEquals(values["ESER_TEST_NUM"], "42"); // Go coerces all JSON values to strings
  } finally {
    await runtime.fs.remove(tmpDir, { recursive: true });
  }
});

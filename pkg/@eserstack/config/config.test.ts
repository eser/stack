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

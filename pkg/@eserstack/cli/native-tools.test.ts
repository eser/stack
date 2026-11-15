// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as client from "@eserstack/ajan/ffi/client";
import * as nativeTools from "./native-tools.ts";

nodeTest.test("the CLI makes the two tools that reach Go", () => {
  const tools = nativeTools.createNativeTools();

  assert.assertEquals(
    tools.map((tool) => tool.name),
    ["native-function", "go-workflow"],
  );

  for (const tool of tools) {
    assert.assertEquals(tool.description.length > 0, true, tool.name);
  }
});

nodeTest.test("making the tools loads no native library", () => {
  // The tools are made on every `workflows` command, and only a call loads the
  // library through the shared client.
  nativeTools.createNativeTools();

  assert.assertEquals(client.getLib(), null);
  assert.assertEquals(client.getLoadError(), null);
});

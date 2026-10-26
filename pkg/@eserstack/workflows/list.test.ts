// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as list from "./list.ts";

nodeTest.test("list parseCliArgs reads --config and --help", () => {
  assert.assertEquals(list.parseCliArgs(["--config", "pkg", "--help"]), {
    help: true,
    config: "pkg",
  });
});

nodeTest.test(
  "list parseCliArgs reads -h and defaults config to undefined",
  () => {
    assert.assertEquals(list.parseCliArgs(["-h"]), {
      help: true,
      config: undefined,
    });
    assert.assertEquals(list.parseCliArgs([]), {
      help: false,
      config: undefined,
    });
  },
);

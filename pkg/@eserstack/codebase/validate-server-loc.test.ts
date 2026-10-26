// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as validateServerLoc from "./validate-server-loc.ts";

nodeTest.test("parseCliArgs reads every flag", () => {
  assert.assertEquals(
    validateServerLoc.parseCliArgs([
      "--directory",
      "cmd/server",
      "--max-lines",
      "300",
      "--exclude-suffix=_test.go",
      "--extension",
      ".go",
    ]),
    {
      directory: "cmd/server",
      maxLines: 300,
      excludeSuffix: "_test.go",
      extension: ".go",
    },
  );
});

nodeTest.test(
  "parseCliArgs leaves the directory empty when it is missing",
  () => {
    assert.assertEquals(validateServerLoc.parseCliArgs([]), {
      directory: "",
      maxLines: undefined,
      excludeSuffix: undefined,
      extension: undefined,
    });
  },
);

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as validation from "./mod.ts";

nodeTest.test("parseCliArgs reads every flag and splits the lists", () => {
  assert.assertEquals(
    validation.parseCliArgs([
      "--root",
      "pkg",
      "--only=eof, bom",
      "--skip",
      "secrets",
      "--fix",
      "--json",
      "-y",
    ]),
    {
      help: false,
      json: true,
      yes: true,
      fix: true,
      root: "pkg",
      onlyList: ["eof", "bom"],
      skipList: ["secrets"],
    },
  );
});

nodeTest.test(
  "parseCliArgs defaults to no root, no lists and false flags",
  () => {
    assert.assertEquals(validation.parseCliArgs([]), {
      help: false,
      json: false,
      yes: false,
      fix: false,
      root: undefined,
      onlyList: [],
      skipList: [],
    });
    assert.assertEquals(validation.parseCliArgs(["-h"]).help, true);
  },
);

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as ghContributors from "./gh-contributors.ts";

nodeTest.test("parseCliArgs reads --columns, --readme and --commit", () => {
  const event = ghContributors.parseCliArgs([
    "--columns",
    "6",
    "--readme=docs/README.md",
    "--commit",
  ]);

  assert.assertEquals(event.flags["columns"], "6");
  assert.assertEquals(event.flags["readme"], "docs/README.md");
  assert.assertEquals(event.flags["commit"], true);
  assert.assertEquals(event.flags["help"], undefined);
});

nodeTest.test("parseCliArgs maps -h to --help", () => {
  assert.assertEquals(ghContributors.parseCliArgs(["-h"]).flags["help"], true);
});

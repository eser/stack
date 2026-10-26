// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as releaseTag from "./release-tag.ts";

nodeTest.test("parseCliArgs reads --dry-run and its -n alias", () => {
  assert.assertEquals(
    releaseTag.parseCliArgs(["--dry-run"]).flags["dry-run"],
    true,
  );
  assert.assertEquals(releaseTag.parseCliArgs(["-n"]).flags["dry-run"], true);
  assert.assertEquals(releaseTag.parseCliArgs([]).flags["dry-run"], undefined);
  assert.assertEquals(releaseTag.parseCliArgs().command, "release-tag");
});

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as cli from "./main.ts";

nodeTest.test("jsrInstallNotice speaks only for a run from jsr.io", () => {
  const notice = cli.jsrInstallNotice(
    "https://jsr.io/@eserstack/cli/4.5.3/main.ts",
  );
  assert.assertExists(notice);
  assert.assertStringIncludes(notice, "frozen at 4.5.x");
  assert.assertStringIncludes(notice, "npm install -g eser");
  assert.assertFalse(notice.includes("\n"));

  assert.assertEquals(
    cli.jsrInstallNotice("file:///home/u/stack/pkg/@eserstack/cli/main.ts"),
    null,
  );
  assert.assertEquals(
    cli.jsrInstallNotice(
      "file:///home/u/.npm/lib/node_modules/eser/dist/main.js",
    ),
    null,
  );
});

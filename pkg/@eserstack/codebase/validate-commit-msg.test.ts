// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as validateCommitMsg from "./validate-commit-msg.ts";

nodeTest.test("parseCliArgs reads --message and -m", () => {
  assert.assertEquals(
    validateCommitMsg.parseCliArgs(["--message", "feat(x): add"]).message,
    "feat(x): add",
  );
  assert.assertEquals(
    validateCommitMsg.parseCliArgs(["-m", "fix(y): mend"]).message,
    "fix(y): mend",
  );
});

nodeTest.test("parseCliArgs reads the commit message file positional", () => {
  assert.assertEquals(validateCommitMsg.parseCliArgs([".git/COMMIT_EDITMSG"]), {
    help: false,
    message: null,
    file: ".git/COMMIT_EDITMSG",
  });
});

nodeTest.test("parseCliArgs reads --message without a value as empty", () => {
  assert.assertEquals(
    validateCommitMsg.parseCliArgs(["--message"]).message,
    "",
  );
});

nodeTest.test("parseCliArgs reads -h and defaults to nothing", () => {
  assert.assertEquals(validateCommitMsg.parseCliArgs(["-h"]).help, true);
  assert.assertEquals(validateCommitMsg.parseCliArgs([]), {
    help: false,
    message: null,
    file: null,
  });
});

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as run from "./run.ts";

nodeTest.test("run parseCliArgs reads the long flags", () => {
  const { help, flags } = run.parseCliArgs([
    "--event",
    "precommit",
    "--workflow=ci",
    "--only",
    "fmt,lint",
    "--config",
    "pkg",
    "--fix",
    "--dry-run",
    "--verbose",
    "--json",
    "--changed",
  ]);

  assert.assertEquals(help, false);
  assert.assertEquals(flags, {
    event: "precommit",
    workflow: "ci",
    config: "pkg",
    fix: true,
    dryRun: true,
    only: "fmt,lint",
    args: [],
    verbose: true,
    json: true,
    changed: true,
  });
});

nodeTest.test("run parseCliArgs reads the -e, -w, -v and -h aliases", () => {
  const { help, flags } = run.parseCliArgs([
    "-e",
    "precommit",
    "-w",
    "ci",
    "-v",
    "-h",
  ]);

  assert.assertEquals(help, true);
  assert.assertEquals(flags.event, "precommit");
  assert.assertEquals(flags.workflow, "ci");
  assert.assertEquals(flags.verbose, true);
});

nodeTest.test(
  "run parseCliArgs defaults config to . and booleans to false",
  () => {
    assert.assertEquals(run.parseCliArgs([]), {
      help: false,
      flags: {
        event: undefined,
        workflow: undefined,
        config: ".",
        fix: false,
        dryRun: false,
        only: undefined,
        args: [],
        verbose: false,
        json: false,
        changed: false,
      },
    });
  },
);

nodeTest.test(
  "run parseCliArgs passes positionals and -- arguments to the tools",
  () => {
    const { flags } = run.parseCliArgs([
      "-e",
      "precommit",
      "src",
      "--",
      "--max=3",
    ]);

    assert.assertEquals(flags.args, ["src", "--max=3"]);
  },
);

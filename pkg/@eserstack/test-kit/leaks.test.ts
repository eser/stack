// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as childProcess from "node:child_process";
import * as nodeTest from "node:test";
import * as url from "node:url";
import * as assert from "./assert.ts";
import * as leaks from "./leaks.ts";

nodeTest.test("diffResources returns the types whose count grew", () => {
  const leaked = leaks.diffResources(
    ["PipeWrap", "Timeout"],
    ["PipeWrap", "Timeout", "Timeout", "Timeout", "TCPServerWrap"],
  );

  assert.assertEquals(leaked, [
    { type: "TCPServerWrap", count: 1 },
    { type: "Timeout", count: 2 },
  ]);
});

nodeTest.test("diffResources ignores resources that went away", () => {
  assert.assertEquals(leaks.diffResources(["Timeout", "PipeWrap"], []), []);
});

nodeTest.test("formatLeaks lists each type with its count", () => {
  assert.assertEquals(
    leaks.formatLeaks([
      { type: "TCPServerWrap", count: 1 },
      { type: "Timeout", count: 2 },
    ]),
    "the test leaked active resources: TCPServerWrap (+1), Timeout (+2)",
  );
});

nodeTest.test("checkLeaks fails the test that leaks a timer", () => {
  const fixture = url.fileURLToPath(
    new URL("./testdata/leaked-timer.ts", import.meta.url),
  );

  // node --test sets NODE_TEST_CONTEXT for its child processes; a nested
  // runner that inherits it reports to this one instead of to its stdout.
  const env = { ...process.env };
  delete env["NODE_TEST_CONTEXT"];

  const result = childProcess.spawnSync(
    process.execPath,
    ["--test", "--test-force-exit", "--test-reporter=tap", fixture],
    { encoding: "utf8", env, timeout: 30_000 },
  );

  assert.assertEquals(result.status, 1, result.stdout + result.stderr);
  assert.assertStringIncludes(result.stdout, "not ok 1 - leaks a timer");
  assert.assertStringIncludes(
    result.stdout,
    "the test leaked active resources: Timeout (+1)",
  );
  assert.assertStringIncludes(result.stdout, "ok 2 - clears its timer");
  assert.assertStringIncludes(result.stdout, "# fail 1");
});

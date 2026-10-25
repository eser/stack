// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as goExec from "./go-exec.ts";
import * as exec from "./exec/mod.ts";

nodeTest.test("goExec: env and timeout reach the command", async () => {
  // goExec used to send env as a record and timeout as a number, and the
  // bridge rejected every such call with "invalid request JSON".
  const result = await goExec.goExec("sh", {
    args: ["-c", 'printf %s "$GREETING"'],
    env: { GREETING: "hello" },
    timeout: 5_000,
  });

  assert.assertEquals(result, { stdout: "hello", stderr: "", code: 0 });
});

nodeTest.test("goExec: a command past its timeout is stopped", async () => {
  await assert.assertRejects(
    () => goExec.goExec("sleep", { args: ["5"], timeout: 200 }),
    exec.CommandRunError,
    "timeout",
  );
});

nodeTest.test("goExec: a non-zero exit is returned, not thrown", async () => {
  const result = await goExec.goExec("sh", {
    args: ["-c", "echo broken >&2; exit 3"],
  });

  assert.assertEquals(result, { stdout: "", stderr: "broken\n", code: 3 });
});

nodeTest.test(
  "goExec: timeout 0 is rejected before the bridge is called",
  async () => {
    await assert.assertRejects(
      () => goExec.goExec("true", { timeout: 0 }),
      RangeError,
      "is out of range",
    );
  },
);

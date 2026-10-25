// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * End-to-end check that a failed request reaches the terminal of `noskills
 * web`. The logging backend writes to the process's stderr outside JavaScript,
 * so the server runs in a probe process and the test reads its stderr.
 */

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";

/** How long the probe may run before the test gives up on it. */
const PROBE_TIMEOUT_MS = 30_000;

const TOKEN = "log-probe-token-" + "b".repeat(48);

const decoder = new TextDecoder();

nodeTest.test(
  "a failed action is logged to stderr under the request id it answers with",
  async () => {
    const probe = runtime.path.join(
      import.meta.dirname ?? ".",
      "testdata",
      "log-probe.ts",
    );

    const output = await runtime.exec.spawn(
      runtime.process.execPath(),
      [probe],
      {
        env: { NOSKILLS_WEB_TOKEN: TOKEN },
        stdout: "piped",
        stderr: "piped",
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      },
    );
    const stdout = decoder.decode(output.stdout);
    const stderr = decoder.decode(output.stderr);

    assert.assertEquals(output.code, 0, stderr);

    const result = JSON.parse(stdout.trim().split("\n").at(-1) ?? "null");
    assert.assertEquals(result.status, 400);
    assert.assertEquals(result.body.error, "Action could not be completed");
    assert.assertMatch(result.body.requestId, /^[0-9a-f-]{36}$/);

    const record = stderr
      .split("\n")
      .find((line) => line.includes(result.body.requestId));
    assert.assertNotEquals(record, undefined, stderr);
    assert.assertStringIncludes(record!, "Action could not be completed");
    assert.assertStringIncludes(record!, '"spec":"no-such-spec"');
    assert.assertStringIncludes(record!, '"action":"approve"');
    // The detail the response leaves out: the error that made the action fail.
    assert.assertStringIncludes(record!, "SpecNotFoundError");
    assert.assertFalse(stderr.includes(TOKEN));
  },
);

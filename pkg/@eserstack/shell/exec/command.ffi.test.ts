// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as exec from "./mod.ts";

// The first spawn() opens the native library, a resource that outlives the
// test that triggered it.
const ffiTest = (name: string, fn: () => Promise<void>): void => {
  Deno.test({ name, sanitizeResources: false, fn });
};

ffiTest("spawn: a timed-out command is not run a second time", async () => {
  // Any bridge error used to fall through to the runtime spawn, so a command
  // the bridge stopped at its timeout ran again, this time with no timeout.
  const dir = await runtime.fs.makeTempDir();
  const runs = `${dir}/runs.txt`;

  try {
    const command = new exec.CommandBuilder("sh", [
      "-c",
      'echo run >> "$1"; sleep 5',
      "sh",
      runs,
    ]).timeout(300);

    await assert.assertRejects(
      () => command.spawn(),
      exec.CommandRunError,
      "timeout",
    );

    assert.assertEquals(await runtime.fs.readTextFile(runs), "run\n");
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
});

ffiTest("spawn: a missing program throws even with noThrow()", async () => {
  // There is no exit code to return, so noThrow() cannot apply.
  const command = new exec.CommandBuilder("eserstack-no-such-program")
    .noThrow();

  const error = await assert.assertRejects(
    () => command.spawn(),
    exec.CommandRunError,
    "eserstack-no-such-program",
  );
  assert.assertEquals(error.command, "eserstack-no-such-program");
});

ffiTest("spawn: env reaches the command through the bridge", async () => {
  // Sent as KEY=VALUE strings; a record fails the bridge's JSON unmarshal.
  const output = await new exec.CommandBuilder("sh", [
    "-c",
    'printf %s "$GREETING"',
  ]).env("GREETING", "hello").timeout(5_000).text();

  assert.assertEquals(output, "hello");
});

ffiTest("spawn: a non-zero exit is a CommandError with stderr", async () => {
  const command = new exec.CommandBuilder("sh", [
    "-c",
    "echo broken >&2; exit 3",
  ]);

  const error = await assert.assertRejects(
    () => command.spawn(),
    exec.CommandError,
  );
  assert.assertEquals(error.code, 3);
  assert.assertEquals(error.stderr, "broken\n");
});
